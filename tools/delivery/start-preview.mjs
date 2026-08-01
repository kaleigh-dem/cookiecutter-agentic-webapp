import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import {
  parseEnvironmentFile,
  validateDeploymentEnvironment,
} from './environment.mjs';

const environmentFile = 'infra/environments/preview.local.env';
const composeFile = 'infra/deploy/compose.preview.yaml';

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    env: options.env ?? process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${result.status ?? 'unknown'}.`,
    );
  }
}

async function loadEnvironment() {
  const values = parseEnvironmentFile(await readFile(environmentFile, 'utf8'));
  const issues = validateDeploymentEnvironment(values, { allowLocal: true });
  if (issues.length > 0) throw new Error(issues.join('\n'));
  return values;
}

async function up() {
  const values = await loadEnvironment();
  const compose = ['compose', '--env-file', environmentFile, '-f', composeFile];

  run('pnpm', ['containers:build'], {
    env: { ...process.env, ...values },
  });
  run('docker', [...compose, 'up', '-d', '--wait', 'postgres', 'redis']);
  run('pnpm', ['db:migrate'], {
    env: {
      ...process.env,
      ...values,
      DATABASE_URL: values.MIGRATION_DATABASE_URL,
    },
  });
  run('docker', [...compose, 'up', '-d', '--wait', 'api', 'worker', 'web']);
  run('node', ['tools/delivery/smoke-test.mjs'], {
    env: { ...process.env, ...values },
  });
}

function down() {
  run('docker', [
    'compose',
    '--env-file',
    environmentFile,
    '-f',
    composeFile,
    'down',
    '--remove-orphans',
    '--volumes',
  ]);
}

async function main() {
  const command = process.argv[2];
  if (command === 'up') return up();
  if (command === 'down') return down();
  throw new Error('Usage: node tools/delivery/start-preview.mjs <up|down>');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
