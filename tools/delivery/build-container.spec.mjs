import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createBuildxCommand,
  parseBuildContainerArguments,
} from './build-container.mjs';

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
