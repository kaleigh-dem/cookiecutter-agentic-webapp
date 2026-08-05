import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFixturePath = 'tools/delivery/fixtures/nx-cache-audit.json';

function normalizeFilePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function expandNamedInput(input, namedInputs, seen = new Set()) {
  if (typeof input !== 'string') return [input];
  if (input.startsWith('^')) return [];
  const named = namedInputs[input];
  if (!named) return [input];
  if (seen.has(input)) {
    throw new Error(`Named input cycle detected at ${input}.`);
  }
  const nextSeen = new Set(seen);
  nextSeen.add(input);
  return named.flatMap((entry) =>
    expandNamedInput(entry, namedInputs, nextSeen),
  );
}

function resolveTargetInputs(nx, project, targetName) {
  const targetInputs = project.targets?.[targetName]?.inputs;
  const defaults = nx.targetDefaults?.[targetName]?.inputs;
  const inputs = targetInputs ?? defaults ?? [];
  return inputs.flatMap((input) =>
    expandNamedInput(input, nx.namedInputs ?? {}),
  );
}

function substituteTokens(pattern, projectRoot) {
  return normalizeFilePath(
    pattern
      .replaceAll('{workspaceRoot}/', '')
      .replaceAll('{workspaceRoot}', '')
      .replaceAll('{projectRoot}', projectRoot),
  );
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function filePatternMatches(file, rawPattern, projectRoot) {
  const pattern = substituteTokens(rawPattern, projectRoot);
  if (pattern.endsWith('/**/*')) {
    const prefix = pattern.slice(0, -5);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (!pattern.includes('*')) return file === pattern;

  const regexSource = escapeRegex(pattern)
    .replaceAll('**', '::DOUBLE_STAR::')
    .replaceAll('*', '[^/]*')
    .replaceAll('::DOUBLE_STAR::', '.*');
  return new RegExp(`^${regexSource}$`).test(file);
}

function targetInvalidates(change, target, nx, project) {
  const inputs = resolveTargetInputs(nx, project, target.target);

  if (change.env) {
    return inputs.some(
      (input) => input && typeof input === 'object' && input.env === change.env,
    );
  }

  if (!change.file) return false;
  const file = normalizeFilePath(change.file);
  const projectFile = `${target.projectRoot}/project.json`;
  if (file === projectFile) return true;

  const positive = inputs.filter(
    (input) => typeof input === 'string' && !input.startsWith('!'),
  );
  const negative = inputs.filter(
    (input) => typeof input === 'string' && input.startsWith('!'),
  );

  const included = positive.some((pattern) =>
    filePatternMatches(file, pattern, target.projectRoot),
  );
  const excluded = negative.some((pattern) =>
    filePatternMatches(file, pattern.slice(1), target.projectRoot),
  );
  return included && !excluded;
}

function auditCiCoverage(ciWorkflow, generatedWorkflow) {
  const checks = [
    {
      name: 'full history checkout',
      ok: /fetch-depth:\s*0/.test(ciWorkflow),
    },
    {
      name: 'Nx base/head setup',
      ok: /nrwl\/nx-set-shas@v5/.test(ciWorkflow),
    },
    {
      name: 'affected typecheck and build',
      ok: /pnpm nx affected -t (?:typecheck build|build typecheck)(?:\s|$)/m.test(
        ciWorkflow,
      ),
    },
    {
      name: 'source Nx cache input audit',
      ok: /node tools\/delivery\/nx-cache-audit\.mjs/.test(ciWorkflow),
    },
    {
      name: 'generated output smoke',
      ok: /workspace-plugin:generated-output-smoke/.test(ciWorkflow),
    },
    {
      name: 'initialization output smoke',
      ok: /workspace-plugin:initialization-output-smoke/.test(ciWorkflow),
    },
    {
      name: 'generated workspace watches workspace generators',
      ok: /tools\/workspace-plugin\/\*\*/.test(generatedWorkflow),
    },
    {
      name: 'generated workspace watches template lifecycle',
      ok: /tools\/template\/\*\*/.test(generatedWorkflow),
    },
    {
      name: 'generated workspace watches Nx configuration',
      ok: /['"]nx\.json['"]/.test(generatedWorkflow),
    },
  ];
  return checks;
}

export function auditConfiguration({
  nx,
  projects,
  fixture,
  ciWorkflow,
  generatedWorkflow,
}) {
  const failures = [];
  const scenarioResults = [];

  for (const scenario of fixture.scenarios) {
    const scenarioFailures = [];
    for (const targetId of scenario.invalidates) {
      const target = fixture.targets[targetId];
      const project = projects[target.projectRoot];
      if (!targetInvalidates(scenario.change, target, nx, project)) {
        scenarioFailures.push(`${targetId} was not invalidated`);
      }
    }
    for (const targetId of scenario.doesNotInvalidate) {
      const target = fixture.targets[targetId];
      const project = projects[target.projectRoot];
      if (targetInvalidates(scenario.change, target, nx, project)) {
        scenarioFailures.push(`${targetId} was unexpectedly invalidated`);
      }
    }
    scenarioResults.push({
      name: scenario.name,
      ok: scenarioFailures.length === 0,
      failures: scenarioFailures,
    });
    failures.push(
      ...scenarioFailures.map((failure) => `${scenario.name}: ${failure}`),
    );
  }

  const ciCoverage = auditCiCoverage(ciWorkflow, generatedWorkflow);
  for (const check of ciCoverage) {
    if (!check.ok) failures.push(`CI coverage: missing ${check.name}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    scenarioCount: scenarioResults.length,
    scenarioResults,
    ciCoverage,
  };
}

export async function loadAuditConfiguration(root) {
  const readJson = async (relativePath) =>
    JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  const fixture = await readJson(defaultFixturePath);
  const projects = {};
  for (const target of Object.values(fixture.targets)) {
    if (!projects[target.projectRoot]) {
      projects[target.projectRoot] = await readJson(
        `${target.projectRoot}/project.json`,
      );
    }
  }

  return {
    nx: await readJson('nx.json'),
    projects,
    fixture,
    ciWorkflow: await readFile(
      path.join(root, '.github/workflows/ci.yml'),
      'utf8',
    ),
    generatedWorkflow: await readFile(
      path.join(root, '.github/workflows/generated-workspace.yml'),
      'utf8',
    ),
  };
}

export async function auditWorkspace(root) {
  return auditConfiguration(await loadAuditConfiguration(root));
}

async function main() {
  const root = path.resolve(process.argv[2] ?? '.');
  const result = await auditWorkspace(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
