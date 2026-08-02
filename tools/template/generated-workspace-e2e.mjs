import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ignoredCopySegments = new Set([
  '.git',
  '.next',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'test-output',
]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--') continue;
    if (!entry.startsWith('--')) {
      throw new Error(`Unexpected argument: ${entry}`);
    }

    const [key, inlineValue] = entry.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function execute(command, args, cwd, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      CI: 'true',
      NX_DAEMON: 'false',
      ...options.env,
    },
    maxBuffer: 50 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      [
        `${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}.`,
        capture ? result.stdout : '',
        capture ? result.stderr : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function capture(command, args, cwd, options = {}) {
  return execute(command, args, cwd, { ...options, capture: true }).stdout;
}

function shouldCopy(workspaceRoot, source) {
  const relativePath = path.relative(workspaceRoot, source);
  if (!relativePath) return true;
  if (relativePath === '.env') return false;

  return !relativePath
    .split(path.sep)
    .some((segment) => ignoredCopySegments.has(segment));
}

function parseEnvironment(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

function composeArguments() {
  return [
    'compose',
    '--env-file',
    'infra/environments/preview.local.env',
    '-f',
    'infra/deploy/compose.preview.yaml',
  ];
}

async function installReleasedPlugin(workspace, artifact, expectedVersion) {
  const pluginPath = path.join(
    workspace,
    'node_modules/@agentic-webapp/workspace-plugin',
  );
  await rm(pluginPath, { force: true, recursive: true });
  await mkdir(pluginPath, { recursive: true });
  execute(
    'tar',
    ['-xzf', artifact, '-C', pluginPath, '--strip-components=1'],
    workspace,
  );

  const packageJson = await readJson(path.join(pluginPath, 'package.json'));
  assert.equal(packageJson.name, '@agentic-webapp/workspace-plugin');
  assert.equal(packageJson.version, expectedVersion);
  assert.equal(packageJson.private, false);
}

async function assertGeneratedContract(workspace, expectedVersion) {
  const manifest = await readJson(
    path.join(workspace, 'workspace.template.json'),
  );
  const packageJson = await readJson(path.join(workspace, 'package.json'));
  const pluginPackage = await readJson(
    path.join(workspace, 'tools/workspace-plugin/package.json'),
  );
  const [readme, gettingStarted, projectChecklist] = await Promise.all([
    readFile(path.join(workspace, 'README.md'), 'utf-8'),
    readFile(path.join(workspace, 'docs/getting-started.md'), 'utf-8'),
    readFile(
      path.join(workspace, 'docs/generated-project-checklist.md'),
      'utf-8',
    ),
  ]);

  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.upstream, {
    repository: 'kaleigh-dem/nx-fullstack-platform',
    version: expectedVersion,
  });
  assert.deepEqual(manifest.application, {
    slug: 'generated-ci',
    displayName: 'Generated Workspace CI',
    packageScope: '@generated-ci',
  });
  assert.deepEqual(manifest.applications, ['web', 'api', 'worker']);
  assert.equal(manifest.database.name, 'generated_ci');
  assert.equal(packageJson.name, '@generated-ci/generated-ci');
  assert.equal(
    packageJson.scripts['initialize:workspace'],
    'nx g @generated-ci/workspace-plugin:preset',
  );
  assert.equal(packageJson.scripts['template:workspace:e2e'], undefined);
  assert.equal(pluginPackage.name, '@generated-ci/workspace-plugin');
  assert.equal(pluginPackage.private, true);

  assert.doesNotMatch(readme, /template migration is under review/i);
  assert.match(gettingStarted, /## Supported profiles/);
  assert.match(gettingStarted, /## Production replacement points/);
  assert.match(projectChecklist, /## Branch protection and required checks/);
  assert.match(projectChecklist, /## Secrets and application configuration/);

  const removedPaths = [
    '.github/workflows/generated-workspace.yml',
    '.github/workflows/template-release.yml',
    'CHANGELOG.md',
    'docs/template-releases.md',
    'docs/template-validation.md',
    'tools/template/generated-workspace-e2e.mjs',
    'tools/template/release.mjs',
    'tools/template/smoke-release-artifact.mjs',
  ];
  for (const relativePath of removedPaths) {
    await assert.rejects(
      stat(path.join(workspace, relativePath)),
      { code: 'ENOENT' },
      `${relativePath} should not remain in a generated repository.`,
    );
  }
}

async function captureComposeLogs(workspace) {
  const outputDirectory = path.join(workspace, 'test-output');
  await mkdir(outputDirectory, { recursive: true });
  const result = execute(
    'docker',
    [...composeArguments(), 'logs', '--no-color'],
    workspace,
    { allowFailure: true, capture: true },
  );
  await writeFile(
    path.join(outputDirectory, 'generated-workspace-compose.log'),
    `${result.stdout}${result.stderr}`,
  );
}

async function verifyTeardown(workspace) {
  const compose = await readFile(
    path.join(workspace, 'infra/deploy/compose.preview.yaml'),
    'utf-8',
  );
  const projectName = compose.match(/^name:\s*([^\s#]+)\s*$/m)?.[1];
  assert.ok(
    projectName,
    'The preview Compose file must declare a project name.',
  );

  const resources = [
    [
      'containers',
      [
        'ps',
        '-aq',
        '--filter',
        `label=com.docker.compose.project=${projectName}`,
      ],
    ],
    [
      'networks',
      [
        'network',
        'ls',
        '-q',
        '--filter',
        `label=com.docker.compose.project=${projectName}`,
      ],
    ],
    [
      'volumes',
      [
        'volume',
        'ls',
        '-q',
        '--filter',
        `label=com.docker.compose.project=${projectName}`,
      ],
    ],
  ];
  for (const [label, args] of resources) {
    const remaining = capture('docker', args, workspace).trim();
    assert.equal(
      remaining,
      '',
      `Preview teardown left ${label} for Compose project ${projectName}: ${remaining}`,
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const artifact = options.artifact ? path.resolve(options.artifact) : null;
  const expectedVersion = options['expected-version'];
  if (!artifact || !expectedVersion) {
    throw new Error('--artifact and --expected-version are required.');
  }
  await stat(artifact);

  const sourceRoot = process.cwd();
  const explicitWorkspace = Boolean(options.workspace);
  const workspace = explicitWorkspace
    ? path.resolve(options.workspace)
    : await mkdtemp(path.join(os.tmpdir(), 'generated-workspace-e2e-'));
  const initialSourceState = capture(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    sourceRoot,
  );

  let primaryError;
  let previewAttempted = false;
  try {
    if (explicitWorkspace) {
      await rm(workspace, { force: true, recursive: true });
      await mkdir(workspace, { recursive: true });
    }
    await cp(sourceRoot, workspace, {
      dereference: false,
      filter: (source) => shouldCopy(sourceRoot, source),
      recursive: true,
    });

    execute(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      workspace,
    );
    await installReleasedPlugin(workspace, artifact, expectedVersion);

    execute(
      'pnpm',
      [
        'exec',
        'nx',
        'g',
        '@agentic-webapp/workspace-plugin:preset',
        'generated-ci',
        '--displayName=Generated Workspace CI',
        '--packageScope=@generated-ci',
        '--repositoryOwner=generated-ci',
        '--codeowners=@generated-ci/platform,@generated-ci/security',
        '--applications=web,api,worker',
        '--authentication=development',
        '--workerTransport=postgres',
        '--telemetry=false',
        '--deploymentProfile=containers',
        '--ai=false',
      ],
      workspace,
    );
    execute(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      workspace,
    );
    await assertGeneratedContract(workspace, expectedVersion);

    execute('git', ['init', '-b', 'main'], workspace);
    execute(
      'git',
      ['config', 'user.email', 'generated-ci@example.invalid'],
      workspace,
    );
    execute(
      'git',
      ['config', 'user.name', 'Generated Workspace CI'],
      workspace,
    );
    execute('git', ['add', '--all'], workspace);
    execute('git', ['commit', '-m', 'Generated workspace baseline'], workspace);

    execute('pnpm', ['check'], workspace);
    execute('pnpm', ['template:identity:check'], workspace);

    const previewEnvironment = parseEnvironment(
      await readFile(
        path.join(workspace, 'infra/environments/preview.local.env'),
        'utf-8',
      ),
    );
    assert.ok(
      previewEnvironment.MIGRATION_DATABASE_URL,
      'MIGRATION_DATABASE_URL is required for generated-workspace validation.',
    );

    previewAttempted = true;
    execute('pnpm', ['preview:up'], workspace);
    execute('pnpm', ['db:seed'], workspace, {
      env: {
        ...previewEnvironment,
        DATABASE_URL: previewEnvironment.MIGRATION_DATABASE_URL,
      },
    });
    execute('pnpm', ['db:status'], workspace, {
      env: {
        ...previewEnvironment,
        DATABASE_URL: previewEnvironment.MIGRATION_DATABASE_URL,
      },
    });
    execute('pnpm', ['preview:smoke'], workspace, {
      env: previewEnvironment,
    });
    execute('pnpm', ['performance:load'], workspace, {
      env: previewEnvironment,
    });
  } catch (error) {
    primaryError = error;
    if (previewAttempted) {
      await captureComposeLogs(workspace);
    }
  } finally {
    if (previewAttempted) {
      execute('pnpm', ['preview:down'], workspace, { allowFailure: true });
      execute('pnpm', ['preview:down'], workspace, { allowFailure: true });
      try {
        await verifyTeardown(workspace);
      } catch (error) {
        primaryError ??= error;
      }
    }

    try {
      execute('pnpm', ['template:identity:check'], workspace);
      const generatedState = capture(
        'git',
        ['status', '--porcelain=v1', '--untracked-files=all'],
        workspace,
      );
      assert.equal(
        generatedState,
        '',
        `Generated workspace validation changed tracked content:\n${generatedState}`,
      );
    } catch (error) {
      primaryError ??= error;
    }

    const finalSourceState = capture(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      sourceRoot,
    );
    if (finalSourceState !== initialSourceState) {
      primaryError ??= new Error(
        `Generated-workspace validation changed the source checkout:\n${finalSourceState}`,
      );
    }
  }

  if (primaryError) {
    console.error(
      `Generated workspace retained at ${workspace} for diagnostics.`,
    );
    throw primaryError;
  }

  console.log(
    `Generated workspace ${workspace} passed validation, migration, seed, preview, smoke, performance, teardown, identity, and cleanliness checks.`,
  );
  if (!explicitWorkspace) {
    await rm(workspace, { force: true, recursive: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
