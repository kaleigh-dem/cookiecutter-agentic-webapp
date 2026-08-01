import { access, cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

async function findFiles(directory, predicate) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(entryPath, predicate)));
    } else if (entry.isFile() && predicate(entry.name)) {
      matches.push(entryPath);
    }
  }
  return matches;
}

async function findCompiledRoot(buildDirectory, entryFile) {
  const candidates = await findFiles(
    buildDirectory,
    (fileName) => fileName === entryFile,
  );
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

function moduleSpecifierPrefix(content, quoteIndex) {
  const prefix = content
    .slice(Math.max(0, quoteIndex - 80), quoteIndex)
    .trimEnd();
  return (
    prefix.endsWith('from') ||
    prefix.endsWith('import') ||
    prefix.endsWith('import(')
  );
}

function moduleSpecifierRanges(content) {
  const ranges = [];

  for (let index = 0; index < content.length; index += 1) {
    const quote = content[index];
    if (quote !== "'" && quote !== '"') continue;

    const start = index + 1;
    let end = start;
    let escaped = false;
    for (; end < content.length; end += 1) {
      const character = content[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === quote) break;
    }

    if (end >= content.length) break;
    if (moduleSpecifierPrefix(content, index)) {
      ranges.push({
        end,
        start,
        value: content.slice(start, end),
      });
    }
    index = end;
  }

  return ranges;
}

function splitSpecifierSuffix(specifier) {
  const queryIndex = specifier.indexOf('?');
  const hashIndex = specifier.indexOf('#');
  const candidates = [queryIndex, hashIndex].filter((index) => index >= 0);
  const suffixIndex = candidates.length > 0 ? Math.min(...candidates) : -1;

  return suffixIndex < 0
    ? { bare: specifier, suffix: '' }
    : {
        bare: specifier.slice(0, suffixIndex),
        suffix: specifier.slice(suffixIndex),
      };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier;
  }

  const { bare, suffix } = splitSpecifierSuffix(specifier);
  if (path.posix.extname(bare)) return specifier;

  const target = path.resolve(path.dirname(filePath), bare);
  if (await exists(`${target}.js`)) return `${bare}.js${suffix}`;
  if (await exists(path.join(target, 'index.js'))) {
    return `${bare.replace(/\/$/u, '')}/index.js${suffix}`;
  }

  throw new Error(
    `Unable to resolve emitted module specifier ${specifier} from ${filePath}.`,
  );
}

export async function rewriteModuleSpecifiers(filePath, content) {
  const replacements = [];
  for (const range of moduleSpecifierRanges(content)) {
    const value = await resolveRelativeSpecifier(filePath, range.value);
    if (value !== range.value) replacements.push({ ...range, value });
  }

  if (replacements.length === 0) return content;

  let cursor = 0;
  let rewritten = '';
  for (const replacement of replacements) {
    rewritten += content.slice(cursor, replacement.start);
    rewritten += replacement.value;
    cursor = replacement.end;
  }
  return rewritten + content.slice(cursor);
}

async function normalizeModuleSpecifiers(compiledRoot) {
  const JavaScriptFiles = await findFiles(
    compiledRoot,
    (fileName) => path.extname(fileName) === '.js',
  );

  for (const filePath of JavaScriptFiles) {
    const content = await readFile(filePath, 'utf8');
    const rewritten = await rewriteModuleSpecifiers(filePath, content);
    if (rewritten !== content) await writeFile(filePath, rewritten);
  }
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
  await normalizeModuleSpecifiers(compiledRoot);
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
  await normalizeModuleSpecifiers(serviceCompiledRoot);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
