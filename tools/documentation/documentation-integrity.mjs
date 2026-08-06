import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_PACKAGE_NAME = '@steadystack/source';
const ARCHITECTURE_PATH = 'docs/architecture/project-graph.md';

const ROOT_SCRIPT_BUILT_INS = new Set([
  'add',
  'approve-builds',
  'audit',
  'create',
  'dlx',
  'exec',
  'install',
  'list',
  'outdated',
  'pack',
  'publish',
  'remove',
  'run',
  'update',
]);

const NX_BUILT_INS = new Set([
  'affected',
  'daemon',
  'exec',
  'format',
  'format:check',
  'format:write',
  'g',
  'generate',
  'graph',
  'mcp',
  'repair',
  'reset',
  'run',
  'run-many',
  'show',
  'sync',
  'sync:check',
]);

const DOCUMENTED_GENERATOR_EXAMPLES = new Set([
  'backend-billing',
  'web-feature-account-settings',
]);

const REPOSITORY_PATH_PREFIXES = [
  '.github/',
  'apps/',
  'docs/',
  'infra/',
  'packages/',
  'performance/',
  'tools/',
  'wiki/',
];

const REPOSITORY_ROOT_FILES = new Set([
  '.env.example',
  '.mcp.json',
  '.node-version',
  'AGENTS.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'README.md',
  'SECURITY.md',
  'compose.yaml',
  'eslint.config.mjs',
  'nx.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'vitest.config.ts',
]);

const ENVIRONMENT_PREFIXES = [
  'API_',
  'APP_',
  'AUTH_',
  'BUILDKIT_',
  'DATABASE_',
  'NEXT_PUBLIC_',
  'OTEL_',
  'PRODUCTION_',
  'RELEASE_',
  'WEB_',
  'WORKER_',
];

const PLATFORM_ENVIRONMENT_PREFIXES = [
  'CI',
  'COREPACK_',
  'DOCKER_',
  'GITHUB_',
  'HOME',
  'NODE_',
  'NPM_',
  'NX_',
  'PATH',
  'PNPM_',
  'RUNNER_',
  'TMP',
];

const LEGACY_IDENTITY_PATTERNS = [
  /@agentic-webapp\b/gi,
  /agentic-webapp-upgrade\b/gi,
  /agentic-webapp-workspace-plugin\b/gi,
  /kaleigh-dem\/nx-fullstack-platform\b/gi,
  /nx-fullstack-platform\.wiki\.git\b/gi,
];

const LEGACY_IDENTITY_ALLOWLIST = new Set([
  'docs/adr/0003-openapi-contract-ownership.md',
  'docs/adr/0017-steadystack-public-identity.md',
  'docs/steadystack-migration.md',
]);

const AUTHENTICATION_DOCUMENTS = [
  'README.md',
  'docs/browser-authentication.md',
  'docs/oidc-authentication.md',
  'wiki/Authentication-and-Authorization.md',
];

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

export function shouldAuditWorkspace(packageJson) {
  return packageJson.name === UPSTREAM_PACKAGE_NAME;
}

function stripMarkdownDestination(value) {
  let destination = value.trim();
  if (destination.startsWith('<') && destination.endsWith('>')) {
    destination = destination.slice(1, -1);
  }
  const titleMatch = destination.match(/^(\S+)(?:\s+["'(].*)$/);
  if (titleMatch) destination = titleMatch[1];
  try {
    return decodeURIComponent(destination);
  } catch {
    return destination;
  }
}

function isExternalDestination(destination) {
  return (
    destination.startsWith('#') ||
    destination.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(destination)
  );
}

function withoutAnchorOrQuery(destination) {
  return destination.split('#', 1)[0].split('?', 1)[0];
}

function pathExists(candidate, trackedFiles) {
  const normalized = normalizePath(candidate).replace(/\/$/, '');
  return (
    trackedFiles.has(normalized) ||
    [...trackedFiles].some((file) => file.startsWith(`${normalized}/`))
  );
}

function resolveMarkdownDestination(markdownPath, rawDestination, trackedFiles) {
  const destination = withoutAnchorOrQuery(
    stripMarkdownDestination(rawDestination),
  );
  if (!destination || isExternalDestination(destination)) return null;

  const directory = path.posix.dirname(markdownPath);
  let candidate = normalizePath(
    path.posix.normalize(path.posix.join(directory, destination)),
  );
  if (pathExists(candidate, trackedFiles)) return candidate;

  if (!path.posix.extname(candidate)) {
    if (pathExists(`${candidate}.md`, trackedFiles)) return `${candidate}.md`;
    if (markdownPath.startsWith('wiki/')) {
      candidate = normalizePath(path.posix.join('wiki', destination));
      if (pathExists(`${candidate}.md`, trackedFiles)) {
        return `${candidate}.md`;
      }
    }
  }
  return candidate;
}

function extractMarkdownLinks(markdown) {
  const links = [];
  for (const match of markdown.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    links.push(match[1]);
  }
  for (const match of markdown.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)) {
    links.push(match[1]);
  }
  return links;
}

function looksLikeRepositoryPath(value) {
  const candidate = withoutAnchorOrQuery(value.replace(/[.,;:]$/, ''));
  if (candidate.includes('://')) return false;
  if (/[<>{}*]/.test(candidate) || /\s/.test(candidate)) return false;
  if (REPOSITORY_ROOT_FILES.has(candidate)) return true;
  return REPOSITORY_PATH_PREFIXES.some((prefix) =>
    candidate.startsWith(prefix),
  );
}

function isExpectedUntrackedRuntimePath(value) {
  return (
    /(?:^|\/)\.env$/.test(value) ||
    /infra\/environments\/[^/]+\.env$/.test(value) ||
    value.startsWith('test-output/')
  );
}

function extractReferencedRepositoryPaths(markdown) {
  const referencedPaths = [];
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    const candidate = withoutAnchorOrQuery(
      match[1].trim().replace(/[.,;:]$/, ''),
    );
    if (looksLikeRepositoryPath(candidate)) referencedPaths.push(candidate);
  }
  return referencedPaths;
}

function extractFencedBlocks(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)^```\s*$/gm)) {
    blocks.push({
      language: match[1].trim().toLowerCase(),
      content: match[2],
    });
  }
  return blocks;
}

function commandLines(content) {
  const commands = [];
  let current = '';
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    current = current ? `${current} ${line}` : line;
    if (current.endsWith('\\')) {
      current = current.slice(0, -1).trimEnd();
    } else {
      commands.push(current);
      current = '';
    }
  }
  if (current) commands.push(current);
  return commands;
}

function shellWords(command) {
  return command
    .replace(/^\$\s*/, '')
    .split(/\s+/)
    .map((word) => word.replace(/^['"]|['";,]$/g, ''));
}

function validatePnpmCommand(command, packageJson, graph) {
  const words = shellWords(command);
  const pnpmIndex = words.findIndex((word) => word === 'pnpm');
  if (pnpmIndex < 0 || !words[pnpmIndex + 1]) return [];
  if (words.includes('--filter')) return [];

  let index = pnpmIndex + 1;
  while (words[index]?.startsWith('-')) index += 1;
  if (words[index] === 'run') index += 1;
  const action = words[index];
  if (!action) return [];

  if (action === 'nx') {
    const nxAction = words[index + 1];
    if (!nxAction) return ['unknown Nx command: (missing)'];
    if (!NX_BUILT_INS.has(nxAction)) {
      const projectName = words[index + 2];
      if (projectName && graph.nodes?.[projectName]?.data?.targets?.[nxAction]) {
        return [];
      }
      return [`unknown Nx command: ${nxAction}`];
    }
    if (nxAction !== 'run') return [];

    const targetSpec = words[index + 2];
    if (!targetSpec || /[<$[{]/.test(targetSpec)) return [];
    const [projectName, targetName] = targetSpec.split(':');
    if (DOCUMENTED_GENERATOR_EXAMPLES.has(projectName)) return [];
    const project = graph.nodes?.[projectName];
    if (!project) return [`unknown Nx project: ${projectName}`];
    if (targetName && !project.data?.targets?.[targetName]) {
      return [`unknown Nx target: ${targetSpec}`];
    }
    return [];
  }

  if (ROOT_SCRIPT_BUILT_INS.has(action)) return [];
  if (!packageJson.scripts?.[action] && !/[<$[{]/.test(action)) {
    return [`unknown root package script: ${action}`];
  }
  return [];
}

function validateNodeCommand(command, trackedFiles) {
  const words = shellWords(command);
  const nodeIndex = words.findIndex((word) => word === 'node');
  if (nodeIndex < 0) return [];
  const script = words.slice(nodeIndex + 1).find((word) => !word.startsWith('-'));
  if (!script || script === '-' || script === '-e' || /[<$[{]/.test(script)) {
    return [];
  }
  const normalized = normalizePath(script.replace(/["';]$/g, ''));
  if (!/\.(?:c?js|mjs|ts)$/.test(normalized)) return [];
  return pathExists(normalized, trackedFiles)
    ? []
    : [`missing Node script: ${normalized}`];
}

function isEnvironmentName(value) {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value);
}

function isDocumentedEnvironmentName(value) {
  return (
    ['DATABASE_URL', 'LOG_LEVEL', 'NODE_ENV'].includes(value) ||
    ENVIRONMENT_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function isPlatformEnvironmentName(value) {
  return PLATFORM_ENVIRONMENT_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(prefix),
  );
}

function extractEnvironmentCatalog(files) {
  const catalog = new Set(['DATABASE_URL', 'LOG_LEVEL', 'NODE_ENV']);
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]+)/g,
    /\bprocess\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
    /["']env["']\s*:\s*["']([A-Z][A-Z0-9_]+)["']/g,
    /^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/gm,
    /^\s{0,12}([A-Z][A-Z0-9_]+):(?:\s|$)/gm,
    /\b(?:ARG|ENV)\s+([A-Z][A-Z0-9_]+)/g,
    /\b(?:env|secrets|vars)\.([A-Z][A-Z0-9_]+)/g,
  ];

  for (const [file, entry] of files) {
    if (file.endsWith('.md')) continue;
    for (const pattern of patterns) {
      for (const match of entry.content.matchAll(pattern)) catalog.add(match[1]);
    }
  }
  return catalog;
}

function extractDocumentedEnvironmentNames(markdown) {
  const names = [];
  for (const block of extractFencedBlocks(markdown)) {
    if (!['dotenv', 'env'].includes(block.language)) continue;
    for (const match of block.content.matchAll(
      /^\s*([A-Z][A-Z0-9_]+)\s*=/gm,
    )) {
      names.push(match[1]);
    }
  }
  for (const match of markdown.matchAll(/`([A-Z][A-Z0-9_]+)`/g)) {
    if (isDocumentedEnvironmentName(match[1])) names.push(match[1]);
  }
  return names;
}

function auditAuthenticationDescriptions(files, failures) {
  const required = new Map([
    [
      'docs/browser-authentication.md',
      [
        'NEXT_PUBLIC_AUTHENTICATION_PROFILE',
        '`development`',
        '`oidc`',
        '`session`',
        '`none`',
        'same-origin',
        'in memory',
      ],
    ],
    [
      'docs/oidc-authentication.md',
      [
        'AUTH_ACCESS_TOKEN_VERIFIER=development|oidc',
        'AUTH_OIDC_ISSUER',
        'AUTH_OIDC_AUDIENCE',
        'identity_provider_unavailable',
        'invalid_access_token',
      ],
    ],
  ]);

  for (const [file, snippets] of required) {
    const content = files.get(file)?.content;
    if (!content) {
      failures.push(`${file}: required authentication document is missing`);
      continue;
    }
    for (const snippet of snippets) {
      if (!content.includes(snippet)) {
        failures.push(
          `${file}: missing current authentication description: ${snippet}`,
        );
      }
    }
  }

  for (const file of AUTHENTICATION_DOCUMENTS) {
    const content = files.get(file)?.content;
    if (
      content &&
      /draft PR #|being implemented in draft|prepared for Phase/i.test(content)
    ) {
      failures.push(`${file}: contains stale draft authentication status language`);
    }
  }
}

function auditLegacyIdentity(files, failures) {
  for (const [file, entry] of files) {
    if (!file.endsWith('.md') || LEGACY_IDENTITY_ALLOWLIST.has(file)) continue;
    for (const pattern of LEGACY_IDENTITY_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(entry.content)) {
        failures.push(`${file}: contains a legacy pre-SteadyStack identity`);
        break;
      }
    }
  }
}

function sanitizeMermaidId(value) {
  return `project_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function escapeMermaidLabel(value) {
  return String(value)
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function projectGroup(node) {
  const root = normalizePath(node.data?.root ?? 'other');
  return root.split('/', 1)[0] || 'other';
}

export function renderArchitectureDiagram(graph) {
  const nodes = Object.values(graph.nodes ?? {}).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const groups = new Map();
  for (const node of nodes) {
    const group = projectGroup(node);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  }

  const lines = [
    '# Nx project graph',
    '',
    '<!-- Generated by `pnpm docs:architecture`. Do not edit this file manually. -->',
    '',
    'This diagram is generated from the Nx project graph and validates the documented project inventory and dependency direction.',
    '',
    '```mermaid',
    'flowchart LR',
  ];

  for (const [group, groupNodes] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(
      `  subgraph ${sanitizeMermaidId(`group_${group}`)}["${escapeMermaidLabel(group)}"]`,
    );
    for (const node of groupNodes) {
      const root = normalizePath(node.data?.root ?? '');
      const tags = [...(node.data?.tags ?? [])].sort().join(', ');
      const label = [node.name, root, tags]
        .filter(Boolean)
        .map(escapeMermaidLabel)
        .join('<br/>');
      lines.push(`    ${sanitizeMermaidId(node.name)}["${label}"]`);
    }
    lines.push('  end');
  }

  const edges = [];
  for (const [source, dependencies] of Object.entries(
    graph.dependencies ?? {},
  )) {
    for (const dependency of dependencies ?? []) {
      if (!graph.nodes?.[source] || !graph.nodes?.[dependency.target]) continue;
      edges.push([source, dependency.target, dependency.type ?? 'static']);
    }
  }
  edges.sort(
    ([sourceA, targetA, typeA], [sourceB, targetB, typeB]) =>
      `${sourceA}\0${targetA}\0${typeA}`.localeCompare(
        `${sourceB}\0${targetB}\0${typeB}`,
      ),
  );
  for (const [source, target, type] of edges) {
    const label = type === 'static' ? '' : `|${escapeMermaidLabel(type)}|`;
    lines.push(
      `  ${sanitizeMermaidId(source)} -->${label} ${sanitizeMermaidId(target)}`,
    );
  }

  lines.push(
    '```',
    '',
    'Regenerate after adding, removing, retagging, or rewiring an Nx project:',
    '',
    '```bash',
    'pnpm docs:architecture',
    '```',
    '',
  );
  return lines.join('\n');
}

function unwrapGraphJson(parsed) {
  if (parsed.graph?.nodes) return parsed.graph;
  if (parsed.nodes) return parsed;
  throw new Error('Nx graph JSON did not contain a project graph.');
}

async function createProjectGraph(root) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'steadystack-docs-'),
  );
  const output = path.join(temporaryDirectory, 'project-graph.json');
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  try {
    const result = spawnSync(command, ['nx', 'graph', `--file=${output}`], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NX_DAEMON: 'false' },
    });
    if (result.status !== 0) {
      throw new Error(
        `Unable to export the Nx project graph.\n${result.stdout ?? ''}${result.stderr ?? ''}`,
      );
    }
    return unwrapGraphJson(JSON.parse(await readFile(output, 'utf8')));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function loadTrackedFiles(root) {
  const tracked = git(root, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(normalizePath);
  const files = new Map();
  for (const file of tracked) {
    try {
      const content = await readFile(path.join(root, file), 'utf8');
      if (!content.includes('\0')) files.set(file, { content });
    } catch {
      // Binary and unreadable tracked files do not participate in this audit.
    }
  }
  return files;
}

function changedFiles(root, base, head) {
  const fields = git(root, ['diff', '--name-status', '-z', base, head])
    .split('\0')
    .filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      changes.push({
        status: status[0],
        previous: normalizePath(fields[index++]),
        file: normalizePath(fields[index++]),
      });
    } else {
      changes.push({ status: status[0], file: normalizePath(fields[index++]) });
    }
  }
  return changes;
}

function readJsonAtRevision(root, revision, file) {
  try {
    return JSON.parse(git(root, ['show', `${revision}:${file}`]));
  } catch {
    return null;
  }
}

function projectBoundaryChanged(root, base, head, change) {
  if (!change.file.endsWith('project.json')) return false;
  if (['A', 'D', 'R'].includes(change.status)) return true;

  const before = readJsonAtRevision(root, base, change.file);
  const after = readJsonAtRevision(root, head, change.file);
  if (!before || !after) return true;
  return (
    JSON.stringify(before.tags ?? []) !== JSON.stringify(after.tags ?? []) ||
    JSON.stringify(before.implicitDependencies ?? []) !==
      JSON.stringify(after.implicitDependencies ?? [])
  );
}

export function auditChangeEvidence({ changes, boundaryChanges = new Set() }) {
  const changed = new Set(changes.map((change) => change.file));
  const generatorChanged = changes.some(
    (change) =>
      change.file === 'tools/workspace-plugin/generators.json' ||
      change.file.startsWith('tools/workspace-plugin/src/generators/') ||
      change.file.startsWith('tools/template/'),
  );
  const architectureChanged = changes.some(
    (change) =>
      ['eslint.config.mjs', 'nx.json', 'tsconfig.base.json'].includes(
        change.file,
      ) || boundaryChanges.has(change.file),
  );
  if (!generatorChanged && !architectureChanged) return [];

  const failures = [];
  if (!changed.has('docs/TODO.md')) {
    failures.push('generator or architecture changes require docs/TODO.md');
  }
  if (
    ![...changed].some(
      (file) => file.startsWith('docs/adr/') && file.endsWith('.md'),
    )
  ) {
    failures.push(
      'generator or architecture changes require a docs/adr/*.md update',
    );
  }
  return failures;
}

function resolveDiffRange(root) {
  const base = process.env.DOCS_INTEGRITY_BASE || process.env.NX_BASE;
  const head = process.env.DOCS_INTEGRITY_HEAD || process.env.NX_HEAD || 'HEAD';
  if (base) return { base, head };

  try {
    const originMain = git(root, [
      'rev-parse',
      '--verify',
      'origin/main',
    ]).trim();
    const current = git(root, ['rev-parse', 'HEAD']).trim();
    if (originMain && originMain !== current) {
      return { base: originMain, head: current };
    }
  } catch {
    // Source archives may not have origin/main; only the diff gate is skipped.
  }
  return null;
}

export function auditDocumentation({
  files,
  packageJson,
  graph,
  changeEvidence = [],
}) {
  const failures = [];
  const trackedFiles = new Set(files.keys());
  const environmentCatalog = extractEnvironmentCatalog(files);

  for (const [file, entry] of files) {
    if (!file.endsWith('.md')) continue;

    for (const destination of extractMarkdownLinks(entry.content)) {
      const resolved = resolveMarkdownDestination(
        file,
        destination,
        trackedFiles,
      );
      if (resolved && !pathExists(resolved, trackedFiles)) {
        failures.push(`${file}: broken internal link: ${destination}`);
      }
    }

    for (const referencedPath of extractReferencedRepositoryPaths(
      entry.content,
    )) {
      if (
        !pathExists(referencedPath, trackedFiles) &&
        !isExpectedUntrackedRuntimePath(referencedPath)
      ) {
        failures.push(
          `${file}: missing referenced repository path: ${referencedPath}`,
        );
      }
    }

    for (const block of extractFencedBlocks(entry.content)) {
      if (
        !['', 'bash', 'console', 'sh', 'shell', 'zsh'].includes(block.language)
      ) {
        continue;
      }
      for (const command of commandLines(block.content)) {
        if (
          !/(^|\s)pnpm\s/.test(command) &&
          !/(^|\s)node\s/.test(command)
        ) {
          continue;
        }
        for (const failure of validatePnpmCommand(
          command,
          packageJson,
          graph,
        )) {
          failures.push(`${file}: ${failure} in \`${command}\``);
        }
        for (const failure of validateNodeCommand(command, trackedFiles)) {
          failures.push(`${file}: ${failure} in \`${command}\``);
        }
      }
    }

    for (const environmentName of extractDocumentedEnvironmentNames(
      entry.content,
    )) {
      if (
        isEnvironmentName(environmentName) &&
        !environmentCatalog.has(environmentName) &&
        !isPlatformEnvironmentName(environmentName)
      ) {
        failures.push(
          `${file}: unknown environment variable: ${environmentName}`,
        );
      }
    }
  }

  auditLegacyIdentity(files, failures);
  auditAuthenticationDescriptions(files, failures);
  failures.push(...changeEvidence);
  return [...new Set(failures)].sort();
}

async function checkArchitecture(root, graph, failures) {
  const destination = path.join(root, ARCHITECTURE_PATH);
  const expected = renderArchitectureDiagram(graph);
  const actual = existsSync(destination)
    ? await readFile(destination, 'utf8')
    : '';
  if (actual === expected) return;

  const diagnosticsDirectory = process.env.CI_DIAGNOSTICS_DIR;
  if (diagnosticsDirectory) {
    await mkdir(diagnosticsDirectory, { recursive: true });
    await writeFile(
      path.join(diagnosticsDirectory, 'project-graph.md'),
      expected,
      'utf8',
    );
  }
  failures.push(
    `${ARCHITECTURE_PATH} is stale; run \`pnpm docs:architecture\``,
  );
}

async function writeArchitecture(root) {
  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  if (!shouldAuditWorkspace(packageJson)) {
    process.stdout.write(
      'Skipping the upstream architecture artifact in an initialized downstream workspace.\n',
    );
    return;
  }

  const destination = path.join(root, ARCHITECTURE_PATH);
  await writeFile(
    destination,
    renderArchitectureDiagram(await createProjectGraph(root)),
    'utf8',
  );
  process.stdout.write(`Wrote ${ARCHITECTURE_PATH}.\n`);
}

export async function checkWorkspace(root) {
  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  if (!shouldAuditWorkspace(packageJson)) {
    process.stdout.write(
      'Skipping the upstream repository documentation audit in an initialized downstream workspace.\n',
    );
    return [];
  }

  const files = await loadTrackedFiles(root);
  const graph = await createProjectGraph(root);
  const changeEvidence = [];
  const range = resolveDiffRange(root);
  if (range) {
    const changes = changedFiles(root, range.base, range.head);
    const boundaryChanges = new Set(
      changes
        .filter((change) =>
          projectBoundaryChanged(root, range.base, range.head, change),
        )
        .map((change) => change.file),
    );
    changeEvidence.push(
      ...auditChangeEvidence({ changes, boundaryChanges }).map(
        (failure) => `change evidence: ${failure}`,
      ),
    );
  }

  const failures = auditDocumentation({
    files,
    packageJson,
    graph,
    changeEvidence,
  });
  await checkArchitecture(root, graph, failures);
  return [...new Set(failures)].sort();
}

async function main() {
  const command = process.argv[2] ?? 'check';
  const root = path.resolve(process.argv[3] ?? '.');
  if (command === 'write-architecture') {
    await writeArchitecture(root);
    return;
  }
  if (command !== 'check') {
    throw new Error(`Unknown documentation command: ${command}`);
  }

  const failures = await checkWorkspace(root);
  if (failures.length === 0) {
    process.stdout.write('Documentation integrity checks passed.\n');
    return;
  }
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
