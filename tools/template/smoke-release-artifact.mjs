import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

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

function run(cwd, command, args) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function capture(cwd, command, args) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

const options = parseArguments(process.argv.slice(2));
const artifact = options.artifact ? path.resolve(options.artifact) : null;
const expectedVersion = options['expected-version'];
if (!artifact || !expectedVersion) {
  throw new Error('--artifact and --expected-version are required.');
}

const sourceRoot = process.cwd();
const workspace = await mkdtemp(
  path.join(os.tmpdir(), 'template-release-smoke-'),
);
try {
  await writeFile(
    path.join(workspace, 'package.json'),
    `${JSON.stringify(
      {
        name: 'template-release-smoke',
        private: true,
        packageManager: 'pnpm@10.13.1',
        devDependencies: {
          '@agentic-webapp/workspace-plugin': `file:${artifact}`,
          '@nx/devkit': '23.1.0',
          nx: '23.1.0',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(workspace, 'nx.json'),
    `${JSON.stringify(
      { $schema: './node_modules/nx/schemas/nx-schema.json' },
      null,
      2,
    )}\n`,
  );

  run(workspace, 'pnpm', ['install', '--ignore-scripts']);
  run(workspace, 'pnpm', [
    'exec',
    'nx',
    'g',
    '@agentic-webapp/workspace-plugin:preset',
    'smoke-app',
    '--displayName=Smoke App',
    '--packageScope=@smoke',
    '--repositoryOwner=smoke-owner',
    '--applications=web',
    '--authentication=none',
    '--workerTransport=none',
    '--deploymentProfile=local',
    '--telemetry=false',
    '--ai=false',
    '--skipFormat',
  ]);

  const manifest = await readJson(
    path.join(workspace, 'workspace.template.json'),
  );
  const packageJson = await readJson(path.join(workspace, 'package.json'));
  if (manifest.upstream?.version !== expectedVersion) {
    throw new Error(
      `Expected upstream template version ${expectedVersion}, received ${manifest.upstream?.version}.`,
    );
  }
  if (manifest.schemaVersion < 2) {
    throw new Error('Preset did not write the identity-aware manifest schema.');
  }
  if (manifest.application?.slug !== 'smoke-app') {
    throw new Error('Preset did not write the requested application slug.');
  }
  if (packageJson.name !== '@smoke/smoke-app') {
    throw new Error(
      `Preset did not rewrite the package name: ${packageJson.name}`,
    );
  }
  if (packageJson.scripts?.['template:upgrade'] !== 'node tools/template/upgrade.mjs') {
    throw new Error('Preset did not retain the downstream upgrade command.');
  }

  const legacyWorkspace = path.join(workspace, 'upgrade-fixture');
  await cp(
    path.join(sourceRoot, 'tools/template/fixtures/upgrade-0.1.0'),
    legacyWorkspace,
    { recursive: true },
  );
  const applicationOwnedPath = path.join(
    legacyWorkspace,
    'apps/api/application-owned.txt',
  );
  const applicationOwnedBefore = await readFile(applicationOwnedPath, 'utf-8');
  const packageBeforeDryRun = await readFile(
    path.join(legacyWorkspace, 'package.json'),
    'utf-8',
  );

  const dryRun = JSON.parse(
    capture(workspace, 'pnpm', [
      'exec',
      'agentic-webapp-upgrade',
      '--workspace',
      legacyWorkspace,
      '--to',
      expectedVersion,
      '--dry-run',
    ]),
  );
  if (dryRun.fromVersion !== '0.1.0' || dryRun.toVersion !== expectedVersion) {
    throw new Error('Upgrade dry run did not select the expected release path.');
  }
  if (dryRun.conflicts.length !== 0) {
    throw new Error(`Upgrade dry run reported conflicts: ${JSON.stringify(dryRun.conflicts)}`);
  }
  if (
    (await readFile(path.join(legacyWorkspace, 'package.json'), 'utf-8')) !==
    packageBeforeDryRun
  ) {
    throw new Error('Upgrade dry run changed the fixture.');
  }

  run(workspace, 'pnpm', [
    'exec',
    'agentic-webapp-upgrade',
    '--workspace',
    legacyWorkspace,
    '--to',
    expectedVersion,
    '--apply',
  ]);

  const upgradedManifest = await readJson(
    path.join(legacyWorkspace, 'workspace.template.json'),
  );
  const upgradedPackage = await readJson(
    path.join(legacyWorkspace, 'package.json'),
  );
  if (upgradedManifest.upstream?.version !== expectedVersion) {
    throw new Error('Applied upgrade did not advance template provenance.');
  }
  if (upgradedManifest.upgrade?.ownershipPolicyVersion !== 1) {
    throw new Error('Applied upgrade did not record the ownership policy.');
  }
  if (
    upgradedPackage.scripts?.['template:upgrade'] !==
    'node tools/template/upgrade.mjs'
  ) {
    throw new Error('Applied upgrade did not install the local upgrade command.');
  }
  if ((await readFile(applicationOwnedPath, 'utf-8')) !== applicationOwnedBefore) {
    throw new Error('Upgrade changed application-owned fixture content.');
  }

  const repeatDryRun = JSON.parse(
    capture(legacyWorkspace, 'node', [
      'tools/template/upgrade.mjs',
      '--to',
      expectedVersion,
      '--dry-run',
    ]),
  );
  if (repeatDryRun.changes.some((change) => change.status !== 'unchanged')) {
    throw new Error('Applied upgrade is not idempotent.');
  }

  console.log(
    `Published workspace-plugin ${expectedVersion} generated a workspace and upgraded the 0.1.0 fixture successfully.`,
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
