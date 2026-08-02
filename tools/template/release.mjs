import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const rootPackagePath = path.join(workspaceRoot, 'package.json');
const pluginRoot = path.join(workspaceRoot, 'tools/workspace-plugin');
const pluginPackagePath = path.join(pluginRoot, 'package.json');
const versionSourcePath = path.join(pluginRoot, 'src/template-version.ts');
const changelogPath = path.join(workspaceRoot, 'CHANGELOG.md');
const tagPrefix = 'template-v';
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseArguments(argv) {
  const [command = 'verify', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index];
    if (!entry.startsWith('--')) {
      throw new Error(`Unexpected argument: ${entry}`);
    }
    const [rawKey, inlineValue] = entry.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) =>
      letter.toUpperCase(),
    );
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options };
}

function requireVersion(value) {
  if (typeof value !== 'string' || !versionPattern.test(value)) {
    throw new Error(
      'version must be a valid semantic version such as 1.2.3 or 1.2.3-rc.1.',
    );
  }
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readVersionState() {
  const [rootPackage, pluginPackage, versionSource] = await Promise.all([
    readJson(rootPackagePath),
    readJson(pluginPackagePath),
    readFile(versionSourcePath, 'utf-8'),
  ]);
  const match = versionSource.match(/templateVersion\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(
      'Unable to read templateVersion from tools/workspace-plugin/src/template-version.ts.',
    );
  }
  return {
    rootPackage,
    pluginPackage,
    sourceVersion: match[1],
  };
}

async function assertVersionConsistency(expectedVersion) {
  const state = await readVersionState();
  const versions = new Map([
    ['package.json', state.rootPackage.version],
    ['tools/workspace-plugin/package.json', state.pluginPackage.version],
    ['tools/workspace-plugin/src/template-version.ts', state.sourceVersion],
  ]);
  const baseline = expectedVersion ?? state.pluginPackage.version;
  requireVersion(baseline);
  const mismatches = [...versions.entries()].filter(
    ([, version]) => version !== baseline,
  );
  if (mismatches.length > 0) {
    throw new Error(
      [
        'Template release versions are inconsistent:',
        ...mismatches.map(
          ([file, version]) =>
            `- ${file}: ${version ?? '<missing>'} (expected ${baseline})`,
        ),
      ].join('\n'),
    );
  }
  return { ...state, version: baseline };
}

function run(command, args, options = {}) {
  const { capture = false, ...execOptions } = options;
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf-8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...execOptions,
  });
}

function latestTemplateTag() {
  try {
    return run(
      'git',
      ['describe', '--tags', '--match', `${tagPrefix}*`, '--abbrev=0'],
      { capture: true },
    ).trim();
  } catch {
    return null;
  }
}

function releaseChanges(sinceTag) {
  const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
  const output = run('git', ['log', '--format=%s%x09%h', range], {
    capture: true,
  }).trim();
  if (!output) return [];
  return output.split('\n').map((line) => {
    const [subject, shortSha] = line.split('\t');
    return { subject, shortSha };
  });
}

function categorizeChanges(changes) {
  const groups = {
    Breaking: [],
    Added: [],
    Fixed: [],
    Changed: [],
  };
  for (const change of changes) {
    if (
      /^[a-z]+(?:\([^)]*\))?!:/.test(change.subject) ||
      /BREAKING CHANGE/i.test(change.subject)
    ) {
      groups.Breaking.push(change);
    } else if (/^feat(?:\([^)]*\))?:/i.test(change.subject)) {
      groups.Added.push(change);
    } else if (/^fix(?:\([^)]*\))?:/i.test(change.subject)) {
      groups.Fixed.push(change);
    } else {
      groups.Changed.push(change);
    }
  }
  return groups;
}

function renderReleaseSection(version, date, changes) {
  const groups = categorizeChanges(changes);
  const lines = [`## [${version}] - ${date}`, ''];
  let wroteGroup = false;
  for (const [heading, entries] of Object.entries(groups)) {
    if (entries.length === 0) continue;
    wroteGroup = true;
    lines.push(`### ${heading}`, '');
    for (const entry of entries) {
      lines.push(`- ${entry.subject} (${entry.shortSha})`);
    }
    lines.push('');
  }
  if (!wroteGroup) {
    lines.push('### Changed', '', '- No user-visible changes.', '');
  }
  return lines.join('\n');
}

async function prepareRelease(version) {
  const state = await readVersionState();
  const date = new Date().toISOString().slice(0, 10);
  const changelog = await readFile(changelogPath, 'utf-8');
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(
      `CHANGELOG.md already contains a ${version} release section.`,
    );
  }

  await writeJson(rootPackagePath, { ...state.rootPackage, version });
  await writeJson(pluginPackagePath, { ...state.pluginPackage, version });
  await writeFile(
    versionSourcePath,
    `export const templateVersion = '${version}';\n`,
  );

  const section = renderReleaseSection(
    version,
    date,
    releaseChanges(latestTemplateTag()),
  );
  const marker = '## [Unreleased]\n';
  if (!changelog.includes(marker)) {
    throw new Error('CHANGELOG.md must contain an "## [Unreleased]" section.');
  }
  await writeFile(
    changelogPath,
    changelog.replace(marker, `${marker}\n${section}\n`),
  );
  console.log(
    `Prepared template release ${version}. Review the version and changelog changes before merging.`,
  );
}

async function extractReleaseNotes(version, outputPath) {
  const changelog = await readFile(changelogPath, 'utf-8');
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start < 0) {
    throw new Error(`CHANGELOG.md does not contain ${heading}.`);
  }
  const next = changelog.indexOf('\n## [', start + heading.length);
  const section = changelog.slice(start, next < 0 ? undefined : next).trim();
  if (outputPath) {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await writeFile(path.resolve(outputPath), `${section}\n`);
  } else {
    console.log(section);
  }
  return section;
}

async function transformedGenerators() {
  const source = await readJson(path.join(pluginRoot, 'generators.json'));
  const generators = {};
  for (const [name, definition] of Object.entries(source.generators)) {
    generators[name] = {
      ...definition,
      factory: definition.factory.replace('./src/', './dist/'),
      schema: definition.schema.replace('./src/', './dist/'),
    };
  }
  return { ...source, generators };
}

async function copyGeneratorSchemas(stageRoot) {
  const generatorsRoot = path.join(pluginRoot, 'src/generators');
  for (const entry of await readdir(generatorsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(generatorsRoot, entry.name, 'schema.json');
    try {
      const destination = path.join(
        stageRoot,
        'dist/generators',
        entry.name,
        'schema.json',
      );
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(schemaPath, destination);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function packagePlugin(version, outputDirectory) {
  const { pluginPackage } = await assertVersionConsistency(version);
  run('pnpm', ['nx', 'run', 'workspace-plugin:build']);

  const stageRoot = path.join(workspaceRoot, 'dist/template-release/package');
  const outputRoot = path.resolve(outputDirectory ?? 'dist/template-release');
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  await cp(
    path.join(workspaceRoot, 'dist/tools/workspace-plugin'),
    path.join(stageRoot, 'dist'),
    { recursive: true },
  );
  await cp(path.join(pluginRoot, 'bin'), path.join(stageRoot, 'bin'), {
    recursive: true,
  });
  await copyGeneratorSchemas(stageRoot);
  await writeJson(
    path.join(stageRoot, 'generators.json'),
    await transformedGenerators(),
  );
  await cp(
    path.join(pluginRoot, 'README.md'),
    path.join(stageRoot, 'README.md'),
  );

  const packaged = {
    ...pluginPackage,
    private: false,
    bin: {
      'agentic-webapp-upgrade': './bin/agentic-webapp-upgrade.mjs',
    },
    files: ['bin', 'dist', 'generators.json', 'README.md'],
  };
  await writeJson(path.join(stageRoot, 'package.json'), packaged);

  run('npm', ['pack', '--pack-destination', outputRoot], { cwd: stageRoot });
  const tarball = path.join(
    outputRoot,
    `agentic-webapp-workspace-plugin-${version}.tgz`,
  );
  console.log(tarball);
  return tarball;
}

async function verifyRelease(version) {
  const state = await assertVersionConsistency(version);
  await extractReleaseNotes(state.version);
  const packageName = state.pluginPackage.name;
  if (packageName !== '@agentic-webapp/workspace-plugin') {
    throw new Error(`Unexpected release package name: ${packageName}`);
  }
  if (state.pluginPackage.private === true) {
    throw new Error(
      'The workspace plugin must be publishable for template releases.',
    );
  }
  console.log(`Template release ${state.version} is internally consistent.`);
}

const { command, options } = parseArguments(process.argv.slice(2));

try {
  if (command === 'prepare') {
    await prepareRelease(requireVersion(options.version));
  } else if (command === 'verify') {
    await verifyRelease(
      options.version ? requireVersion(options.version) : undefined,
    );
  } else if (command === 'pack') {
    await packagePlugin(requireVersion(options.version), options.output);
  } else if (command === 'notes') {
    await extractReleaseNotes(requireVersion(options.version), options.output);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
