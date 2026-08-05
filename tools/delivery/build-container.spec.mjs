import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createBuildxCommand,
  parseBuildContainerArguments,
  recoverCacheDirectory,
  replaceCacheDirectory,
} from './build-container.mjs';

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'build-container-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeCache(directory, value) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'marker.txt'), value);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('BuildKit container builds', () => {
  it('uses an uncached deterministic fallback by default', () => {
    const command = createBuildxCommand(
      {
        scope: 'api',
        file: 'infra/docker/Dockerfile.node-service',
        tag: 'example/api:test',
        buildArguments: ['SERVICE=api', 'APP_VERSION=1.2.3'],
        context: '.',
      },
      {
        cacheRoot: '.cache/example',
        cacheEnabled: false,
        cacheExists: true,
      },
    );

    expect(command.arguments_).toEqual([
      'buildx',
      'build',
      '--load',
      '--file',
      'infra/docker/Dockerfile.node-service',
      '--tag',
      'example/api:test',
      '--build-arg',
      'SERVICE=api',
      '--build-arg',
      'APP_VERSION=1.2.3',
      '.',
    ]);
    expect(command.cacheEnabled).toBe(false);
  });

  it('exports an enabled cache even when no restored cache exists', () => {
    const command = createBuildxCommand(
      {
        scope: 'api',
        file: 'infra/docker/Dockerfile.node-service',
        tag: 'example/api:test',
        buildArguments: [],
      },
      {
        cacheRoot: '.cache/example',
        cacheEnabled: true,
        cacheExists: false,
      },
    );

    expect(command.arguments_).not.toContain('--cache-from');
    expect(command.arguments_).toContain('--cache-to');
    expect(command.arguments_).toContain(
      `type=local,dest=${resolve('.cache/example/api')}.next,mode=max`,
    );
  });

  it('reuses a restored cache and writes a separate next cache', () => {
    const command = createBuildxCommand(
      {
        scope: 'web-runtime',
        file: 'infra/docker/Dockerfile.web',
        tag: 'example/web:test',
        target: 'runtime',
        buildArguments: [],
      },
      {
        cacheRoot: '.cache/example',
        cacheEnabled: true,
        cacheExists: true,
      },
    );

    expect(command.arguments_).toContain('--cache-from');
    expect(command.arguments_).toContain(
      `type=local,src=${resolve('.cache/example/web-runtime')}`,
    );
    expect(command.arguments_).toContain('--target');
    expect(command.currentCache).not.toBe(command.nextCache);
  });

  it('excludes cache blobs from the Docker build context', () => {
    const ignoredPaths = readFileSync(
      new URL('../../.dockerignore', import.meta.url),
      'utf8',
    )
      .split(/\r?\n/u)
      .filter(Boolean);

    expect(ignoredPaths).toContain('.cache');
  });

  it('installs a completed cache before removing the previous generation', () => {
    const root = temporaryDirectory();
    const currentCache = join(root, 'api');
    const nextCache = `${currentCache}.next`;
    writeCache(currentCache, 'old');
    writeCache(nextCache, 'new');

    replaceCacheDirectory(currentCache, nextCache);

    expect(readFileSync(join(currentCache, 'marker.txt'), 'utf8')).toBe('new');
    expect(existsSync(`${currentCache}.previous`)).toBe(false);
  });

  it('restores the previous cache when installation fails', () => {
    const root = temporaryDirectory();
    const currentCache = join(root, 'worker');
    const nextCache = `${currentCache}.next`;
    writeCache(currentCache, 'old');
    writeCache(nextCache, 'new');
    let renameCalls = 0;

    expect(() =>
      replaceCacheDirectory(currentCache, nextCache, {
        renameSync(source, destination) {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error('forced install failure');
          renameSync(source, destination);
        },
      }),
    ).toThrow('forced install failure');

    expect(readFileSync(join(currentCache, 'marker.txt'), 'utf8')).toBe('old');
    expect(readFileSync(join(nextCache, 'marker.txt'), 'utf8')).toBe('new');
    expect(existsSync(`${currentCache}.previous`)).toBe(false);
  });

  it('recovers a previous cache after an interrupted replacement', () => {
    const root = temporaryDirectory();
    const currentCache = join(root, 'web-runtime');
    const backupCache = `${currentCache}.previous`;
    writeCache(currentCache, 'old');
    renameSync(currentCache, backupCache);

    recoverCacheDirectory(currentCache);

    expect(readFileSync(join(currentCache, 'marker.txt'), 'utf8')).toBe('old');
    expect(existsSync(backupCache)).toBe(false);
  });

  it('parses repeated build arguments without depending on GitHub Actions', () => {
    expect(
      parseBuildContainerArguments([
        '--scope',
        'worker',
        '--file',
        'Dockerfile',
        '--tag',
        'worker:local',
        '--build-arg',
        'SERVICE=worker',
        '--build-arg',
        'APP_VERSION=development',
      ]),
    ).toEqual({
      scope: 'worker',
      file: 'Dockerfile',
      tag: 'worker:local',
      buildArguments: ['SERVICE=worker', 'APP_VERSION=development'],
      context: '.',
    });
  });
});
