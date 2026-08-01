import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const services = {
  api: {
    appDirectory: 'apps/api',
    buildDirectory: 'dist/apps/api',
    workspacePackages: [
      ['packages/backend/agent-task', 'dist/packages/backend/agent-task'],
      ['packages/contracts', 'dist/packages/contracts'],
      ['packages/database', 'dist/packages/database'],
      ['packages/observability', 'dist/packages/observability'],
    ],
  },
  worker: {
    appDirectory: 'apps/worker',
    buildDirectory: 'dist/apps/worker',
    workspacePackages: [
      ['packages/contracts', 'dist/packages/contracts'],
      ['packages/observability', 'dist/packages/observability'],
    ],
  },
};

function compiledTarget(value, key) {
  if (typeof value !== 'string' || !value.startsWith('./src/')) return value;

  const base = value.replace('./src/', './dist/').replace(/\.ts$/u, '');
  return key === 'types' ? `${base}.d.ts` : `${base}.js`;
}

function rewritePackageValue(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((entry) => rewritePackageValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        rewritePackageValue(entryValue, entryKey),
      ]),
    );
  }

  return compiledTarget(value, key);
}

async function stageCompiledPackage(packageDirectory, buildDirectory) {
  const destination = path.join(packageDirectory, 'dist');
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  await cp(buildDirectory, destination, { recursive: true });

  const manifestPath = path.join(packageDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const rewritten = rewritePackageValue(manifest);
  await writeFile(manifestPath, `${JSON.stringify(rewritten, null, 2)}\n`);
}

async function main() {
  const [serviceName, deployDirectory] = process.argv.slice(2);
  const service = services[serviceName];

  if (!service || !deployDirectory) {
    throw new Error(
      'Usage: node tools/delivery/prepare-node-deploy.mjs <api|worker> <deploy-directory>',
    );
  }

  const appDist = path.join(service.appDirectory, 'dist');
  await rm(appDist, { force: true, recursive: true });
  await mkdir(appDist, { recursive: true });
  await cp(service.buildDirectory, appDist, { recursive: true });

  for (const [packageDirectory, buildDirectory] of service.workspacePackages) {
    await stageCompiledPackage(packageDirectory, buildDirectory);
  }

  await rm(deployDirectory, { force: true, recursive: true });
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      `@agentic-webapp/${serviceName}`,
      'deploy',
      '--prod',
      '--legacy',
      deployDirectory,
    ],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error(
      `pnpm deploy failed with status ${result.status ?? 'unknown'}.`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
