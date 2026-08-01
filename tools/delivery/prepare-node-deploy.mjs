import {
  access,
  cp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
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

async function findFiles(directory, fileName) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(entryPath, fileName)));
    } else if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  }
  return matches;
}

async function findCompiledRoot(buildDirectory, entryFile) {
  const candidates = await findFiles(buildDirectory, entryFile);
  if (candidates.length === 0) {
    throw new Error(`${entryFile} was not emitted under ${buildDirectory}.`);
  }

  candidates.sort((left, right) => {
    const depthDifference =
      path.relative(buildDirectory, left).split(path.sep).length -
      path.relative(buildDirectory, right).split(path.sep).length;
    return depthDifference || left.localeCompare(right);
  });
  return path.dirname(candidates[0]);
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
  const compiledRoot = await findCompiledRoot(buildDirectory, 'index.js');
  await replaceDirectory(compiledRoot, path.join(packageDirectory, 'dist'));
  const manifest = {
    ...rewritePackageValue(await readManifest(packageDirectory)),
    files: ['dist'],
  };
  await writeManifest(packageDirectory, manifest);
  return { compiledRoot, manifest };
}

function deployedPackageDirectory(deployDirectory, packageName) {
  return path.join(deployDirectory, 'node_modules', ...packageName.split('/'));
}

async function installCompiledArtifacts(
  deployDirectory,
  serviceCompiledRoot,
  stagedPackages,
) {
  const appDestination = path.join(deployDirectory, 'dist');
  await replaceDirectory(serviceCompiledRoot, appDestination);
  await access(path.join(appDestination, 'main.js'));

  for (const { compiledRoot, manifest } of stagedPackages) {
    const packageDirectory = deployedPackageDirectory(
      deployDirectory,
      manifest.name,
    );
    await replaceDirectory(compiledRoot, path.join(packageDirectory, 'dist'));
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

  const serviceCompiledRoot = await findCompiledRoot(
    service.buildDirectory,
    'main.js',
  );
  await replaceDirectory(
    serviceCompiledRoot,
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

  await installCompiledArtifacts(
    deployDirectory,
    serviceCompiledRoot,
    stagedPackages,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
