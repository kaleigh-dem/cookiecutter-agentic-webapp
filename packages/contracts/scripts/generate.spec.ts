import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('./generate.ts', import.meta.url));
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
  it(
    'requires request arguments for referenced path-level parameters and request bodies',
    async () => {
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
              parameters: [
                { $ref: '#/components/parameters/RequiredLimit' },
              ],
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
        'createItem(request: OperationRequest<operations["createItem"]>)',
      );
      expect(client).not.toContain('listItems(request?:');
      expect(client).not.toContain('createItem(request?:');
      expect(client).not.toContain('listItems(request = {})');
      expect(client).not.toContain('createItem(request = {})');
    },
    30_000,
  );
});
