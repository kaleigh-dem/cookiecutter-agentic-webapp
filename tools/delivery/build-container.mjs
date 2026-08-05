import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /[\r\n]/u.test(normalized)) {
    throw new Error(`${label} is required and must be one line.`);
  }
  return normalized;
}

export function parseBuildContainerArguments(arguments_) {
  const values = { buildArguments: [], context: '.' };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith('--')) {
      throw new Error(`Unknown build-container argument: ${argument}.`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    switch (argument) {
      case '--scope':
        values.scope = value;
        break;
      case '--file':
        values.file = value;
        break;
      case '--tag':
        values.tag = value;
        break;
      case '--target':
        values.target = value;
        break;
      case '--build-arg':
        values.buildArguments.push(value);
        break;
      case '--context':
        values.context = value;
        break;
      default:
        throw new Error(`Unknown build-container argument: ${argument}.`);
    }
  }
  return values;
}

export function createBuildxCommand(input, options = {}) {
  const scope = required(input.scope, 'Cache scope');
  const file = required(input.file, 'Dockerfile');
  const tag = required(input.tag, 'Image tag');
  const context = required(input.context ?? '.', 'Build context');
  const cacheEnabled =
    options.cacheEnabled ?? process.env.BUILDKIT_CACHE_ENABLED === 'true';
  const cacheRoot = resolve(
    options.cacheRoot ?? process.env.BUILDKIT_CACHE_DIR ?? '.cache/buildkit',
  );
  const currentCache = resolve(cacheRoot, scope);
  const nextCache = `${currentCache}.next`;
  const cacheExists =
    cacheEnabled && (options.cacheExists ?? existsSync(currentCache));
  const arguments_ = [
    'buildx',
    'build',
    '--load',
    '--file',
    file,
    '--tag',
    tag,
  ];

  if (input.target)
    arguments_.push('--target', required(input.target, 'Target'));
  for (const buildArgument of input.buildArguments ?? []) {
    arguments_.push('--build-arg', required(buildArgument, 'Build argument'));
  }
  if (cacheExists) {
    arguments_.push('--cache-from', `type=local,src=${currentCache}`);
  }
  if (cacheEnabled) {
    arguments_.push('--cache-to', `type=local,dest=${nextCache},mode=max`);
  }
  arguments_.push(context);

  return {
    arguments_,
    cacheEnabled,
    currentCache,
    nextCache,
  };
}

export function runContainerBuild(input) {
  const command = createBuildxCommand(input);
  if (command.cacheEnabled) {
    rmSync(command.nextCache, { recursive: true, force: true });
    mkdirSync(dirname(command.nextCache), { recursive: true });
  }

  const result = spawnSync('docker', command.arguments_, {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (command.cacheEnabled) {
      rmSync(command.nextCache, { recursive: true, force: true });
    }
    throw new Error(
      `docker ${command.arguments_.join(' ')} failed with status ${result.status ?? 'unknown'}.`,
    );
  }

  if (command.cacheEnabled && existsSync(command.nextCache)) {
    rmSync(command.currentCache, { recursive: true, force: true });
    renameSync(command.nextCache, command.currentCache);
  }
}

async function main() {
  runContainerBuild(parseBuildContainerArguments(process.argv.slice(2)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
