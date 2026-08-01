import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const nextEnvironmentPath = resolve('apps/web/next-env.d.ts');
const originalNextEnvironment = readFileSync(nextEnvironmentPath);

try {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'packages/web/features/agent-tasks/playwright.config.ts',
    ],
    {
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  writeFileSync(nextEnvironmentPath, originalNextEnvironment);
}
