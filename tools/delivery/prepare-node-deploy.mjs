import { access, cp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function replaceDirectory(source, destination) {
  await rm(destination, { force: true, recursive: true });
  await cp(source, destination, { recursive: true });
}

async function readManifest(packageDirectory) {
  return JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
}

async function writeManifest(packageDirectory, manifest) {
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function stageCompiledPackage(packageDirectory, buildDirectory) {
  await replaceDirectory(buildDirectory, path.join(packageDirectory, 'dist'));
  const manifest = {
    ...rewritePackageValue(await readManifest(packageDirectory)),
    files: ['dist'],
  };
  await writeManifest(packageDirectory, manifest);
  return { buildDirectory, manifest };
}

function deployedPackageDirectory(deployDirectory, packageName) {
  return path.join(deployDirectory, 'node_modules', ...packageName.split('/'));
}

async function installCompiledArtifacts(
  deployDirectory,
  service,
  stagedPackages,
) {
  const appDestination = path.join(deployDirectory, 'dist');
  await replaceDirectory(service.buildDirectory, appDestination);
  await access(path.join(appDestination, 'main.js'));

  for (const { buildDirectory, manifest } of stagedPackages) {
    const packageDirectory = deployedPackageDirectory(
      deployDirectory,
      manifest.name,
    );
    await replaceDirectory(buildDirectory, path.join(packageDirectory, 'dist'));
    await writeManifest(packageDirectory, manifest);
    await access(path.join(packageDirectory, 'dist', 'index.js'));
  }
}

async function main() {
  const [serviceName, deployDirectory] = process.argv.slice(2);
  const service = services[serviceName];

  if (!service || !deployDirectory) {
    throw new Error(
      'Usage: node tools/delivery/prepare-node-deploy.mjs <api|worker> <deploy-directory>',
    );
  }

  await replaceDirectory(
    service.buildDirectory,
    path.join(service.appDirectory, 'dist'),
  );
  const appManifest = {
    ...(await readManifest(service.appDirectory)),
    files: ['dist'],
  };
  await writeManifest(service.appDirectory, appManifest);

  const stagedPackages = [];
  for (const [packageDirectory, buildDirectory] of service.workspacePackages) {
    stagedPackages.push(
      await stageCompiledPackage(packageDirectory, buildDirectory),
    );
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

  await installCompiledArtifacts(deployDirectory, service, stagedPackages);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
