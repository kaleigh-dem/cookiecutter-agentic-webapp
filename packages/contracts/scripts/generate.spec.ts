import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('./generate.ts', import.meta.url));
const typeScriptPath = fileURLToPath(
  new URL('../../../node_modules/typescript/bin/tsc', import.meta.url),
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

describe('OpenAPI client generation', () => {
  it('requires referenced path, query, and body inputs at the type level', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'contracts-generation-'),
    );
    temporaryDirectories.push(directory);
    const sourceDirectory = path.join(directory, 'openapi/source');
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(
      path.join(sourceDirectory, 'openapi.json'),
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Fixture API', version: '1.0.0' },
        paths: {
          '/items': {
            parameters: [{ $ref: '#/components/parameters/RequiredLimit' }],
            get: {
              operationId: 'listItems',
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '/items/{itemId}': {
            parameters: [{ $ref: '#/components/parameters/RequiredItemId' }],
            get: {
              operationId: 'getItem',
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          '/items/create': {
            post: {
              operationId: 'createItem',
              requestBody: {
                $ref: '#/components/requestBodies/CreateItem',
              },
              responses: {
                '201': {
                  description: 'created',
                  content: {
                    'application/json': {
                      schema: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          parameters: {
            RequiredLimit: {
              in: 'query',
              name: 'limit',
              required: true,
              schema: { type: 'integer' },
            },
            RequiredItemId: {
              in: 'path',
              name: 'itemId',
              required: true,
              schema: { type: 'string' },
            },
          },
          requestBodies: {
            CreateItem: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          schemas: {},
        },
      }),
      'utf-8',
    );

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', scriptPath],
      {
        encoding: 'utf-8',
        env: {
          ...process.env,
          CONTRACTS_PACKAGE_ROOT: directory,
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);

    const client = await readFile(
      path.join(directory, 'src/generated/client.ts'),
      'utf-8',
    );
    expect(client).toContain(
      'listItems(request: OperationRequest<operations["listItems"]>)',
    );
    expect(client).toContain(
      'getItem(request: OperationRequest<operations["getItem"]>)',
    );
    expect(client).toContain(
      'createItem(request: OperationRequest<operations["createItem"]>)',
    );

    const runtime = await readFile(
      path.join(directory, 'src/generated/runtime.ts'),
      'utf-8',
    );
    expect(runtime).toContain('export const listItemsHttpContract');
    expect(runtime).toContain(
      'query: z.strictObject({ "limit": z.number().int() })',
    );
    expect(runtime).toContain('path: z.strictObject({ "itemId": z.string() })');
    expect(runtime).toContain(
      'body: z.looseObject({ "name": z.string().optional() })',
    );

    const typecheckPath = path.join(directory, 'typecheck.ts');
    await writeFile(
      typecheckPath,
      `import type { ApiClient } from './src/generated/client';

declare const client: ApiClient;

// @ts-expect-error required query input must be present
void client.listItems({});
void client.listItems({ query: { limit: 10 } });

// @ts-expect-error required path input must be present
void client.getItem({});
void client.getItem({ path: { itemId: 'item-1' } });

// @ts-expect-error required request body must be present
void client.createItem({});
void client.createItem({ body: { name: 'example' } });
`,
      'utf-8',
    );

    const typecheck = spawnSync(
      process.execPath,
      [
        typeScriptPath,
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--lib',
        'ES2022,DOM',
        typecheckPath,
      ],
      { encoding: 'utf-8' },
    );
    expect(typecheck.status, typecheck.stderr || typecheck.stdout).toBe(0);
  }, 30_000);
});
