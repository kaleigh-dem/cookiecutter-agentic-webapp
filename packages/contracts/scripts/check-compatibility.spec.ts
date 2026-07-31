import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('./check-compatibility.ts', import.meta.url),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function runCompatibility(
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'contracts-compatibility-'),
  );
  temporaryDirectories.push(directory);
  const baselinePath = path.join(directory, 'baseline.json');
  const currentPath = path.join(directory, 'current.json');
  await Promise.all([
    writeFile(baselinePath, JSON.stringify(baseline), 'utf-8'),
    writeFile(currentPath, JSON.stringify(current), 'utf-8'),
  ]);

  return spawnSync(process.execPath, ['--import', 'tsx', scriptPath], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      OPENAPI_BASELINE_PATH: baselinePath,
      OPENAPI_CURRENT_PATH: currentPath,
    },
  });
}

function contract(requiredParameter: boolean, requiredProperty: boolean) {
  return {
    openapi: '3.1.0',
    paths: {
      '/items': {
        get: {
          operationId: 'listItems',
          parameters: [
            {
              in: 'query',
              name: 'limit',
              required: requiredParameter,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': { description: 'ok' },
          },
        },
      },
    },
    components: {
      schemas: {
        CreateItem: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          ...(requiredProperty ? { required: ['name'] } : {}),
        },
      },
    },
  };
}

describe('OpenAPI compatibility checks', () => {
  it('rejects an existing optional parameter becoming required', async () => {
    const result = await runCompatibility(
      contract(false, false),
      contract(true, false),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'GET /items made parameter query:limit required.',
    );
  });

  it('rejects an existing optional schema property becoming required', async () => {
    const result = await runCompatibility(
      contract(false, false),
      contract(false, true),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Component schema CreateItem made property name required.',
    );
  });
});
