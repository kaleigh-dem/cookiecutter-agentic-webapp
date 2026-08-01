import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
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

const options = parseArguments(process.argv.slice(2));
const artifact = options.artifact ? path.resolve(options.artifact) : null;
const expectedVersion = options['expected-version'];
if (!artifact || !expectedVersion) {
  throw new Error('--artifact and --expected-version are required.');
}

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

  const manifest = JSON.parse(
    await readFile(path.join(workspace, 'workspace.template.json'), 'utf-8'),
  );
  const packageJson = JSON.parse(
    await readFile(path.join(workspace, 'package.json'), 'utf-8'),
  );
  if (manifest.upstream?.version !== expectedVersion) {
    throw new Error(
      `Expected upstream template version ${expectedVersion}, received ${manifest.upstream?.version}.`,
    );
  }
  if (manifest.application?.slug !== 'smoke-app') {
    throw new Error('Preset did not write the requested application slug.');
  }
  if (packageJson.name !== '@smoke/smoke-app') {
    throw new Error(
      `Preset did not rewrite the package name: ${packageJson.name}`,
    );
  }
  console.log(
    `Published workspace-plugin ${expectedVersion} installed and invoked its preset successfully.`,
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
