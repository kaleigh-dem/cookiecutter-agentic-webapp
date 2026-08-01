import { readJson, type Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import initGenerator, {
  createWorkspaceManifest,
  normalizeInitOptions,
} from './generator';
import type { InitGeneratorSchema } from './schema';

const validOptions: InitGeneratorSchema = {
  applicationSlug: 'customer-portal',
  displayName: 'Customer Portal',
  packageScope: '@acme',
  repositoryOwner: 'acme-platform',
  codeowners: '@acme/security,@acme/platform',
  applications: 'worker,web,api',
  webPort: 3100,
  apiPort: 4100,
  databasePort: 55432,
  databaseName: 'customer_portal',
  authentication: 'oidc',
  workerTransport: 'postgres',
  telemetry: true,
  deploymentProfile: 'containers',
  ai: true,
  skipFormat: true,
};

function createWorkspaceTree(): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', {
    name: '@agentic-webapp/source',
    scripts: {
      build: 'nx run-many -t build',
      'containers:build': 'old-command',
    },
  });
  tree.write(
    '.env.example',
    [
      'WEB_PORT=3000',
      'API_PORT=4000',
      'WEB_ORIGIN=http://localhost:3000',
      'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000',
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app',
      'OTEL_EXPORTER_OTLP_ENDPOINT=',
      'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=',
      '',
    ].join('\n'),
  );
  return tree;
}

describe('init generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createWorkspaceTree();
  });

  it('writes the normalized initialization contract and workspace defaults', async () => {
    await initGenerator(tree, validOptions);

    expect(readJson(tree, 'workspace.template.json')).toMatchInlineSnapshot(`
      {
        "application": {
          "displayName": "Customer Portal",
          "packageScope": "@acme",
          "slug": "customer-portal",
        },
        "applications": [
          "web",
          "api",
          "worker",
        ],
        "database": {
          "name": "customer_portal",
        },
        "ports": {
          "api": 4100,
          "database": 55432,
          "web": 3100,
        },
        "profiles": {
          "ai": true,
          "authentication": "oidc",
          "deployment": "containers",
          "telemetry": true,
          "workerTransport": "postgres",
        },
        "repository": {
          "codeowners": [
            "@acme/platform",
            "@acme/security",
          ],
          "owner": "acme-platform",
        },
        "schemaVersion": 1,
      }
    `);

    const packageJson = readJson<{
      name: string;
      scripts: Record<string, string>;
    }>(tree, 'package.json');
    expect(packageJson.name).toBe('@acme/customer-portal');
    expect(packageJson.scripts['containers:build']).toBe(
      'nx run-many -t container --projects=web,api,worker --parallel=1',
    );

    expect(tree.read('.github/CODEOWNERS', 'utf-8')).toContain(
      '/apps/worker/ @acme/platform @acme/security',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain('WEB_PORT=3100');
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:55432/customer_portal',
    );
    expect(tree.read('.env.example', 'utf-8')).toContain(
      'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318',
    );
  });

  it('normalizes list ordering and produces deterministic manifests', () => {
    const first = createWorkspaceManifest(normalizeInitOptions(validOptions));
    const second = createWorkspaceManifest(
      normalizeInitOptions({
        ...validOptions,
        codeowners: [
          '@acme/platform',
          '@acme/security',
          '@acme/platform',
        ],
        applications: ['api', 'worker', 'web'],
      }),
    );

    expect(second).toEqual(first);
  });

  it('derives safe defaults from the selected applications', () => {
    expect(
      normalizeInitOptions({
        applicationSlug: 'docs-site',
        packageScope: '@acme',
        repositoryOwner: 'acme',
        applications: 'web',
      }),
    ).toMatchObject({
      displayName: 'Docs Site',
      authentication: 'none',
      workerTransport: 'none',
      databaseName: 'docs_site',
      codeowners: ['@acme'],
    });
  });

  it.each([
    [
      'invalid slug',
      { ...validOptions, applicationSlug: 'Customer Portal' },
      'applicationSlug',
    ],
    [
      'invalid scope',
      { ...validOptions, packageScope: 'acme' },
      'packageScope',
    ],
    [
      'duplicate ports',
      { ...validOptions, apiPort: 3100 },
      'must be unique',
    ],
    [
      'authentication without api',
      {
        ...validOptions,
        applications: 'web',
        authentication: 'oidc',
        workerTransport: 'none',
        ai: false,
      },
      'require the api application',
    ],
    [
      'worker transport without worker',
      {
        ...validOptions,
        applications: 'web,api',
        workerTransport: 'redis',
        ai: false,
      },
      'requires the worker application',
    ],
    [
      'ai without web and api',
      {
        ...validOptions,
        applications: 'api',
        workerTransport: 'none',
        ai: true,
      },
      'require both web and api',
    ],
  ])('rejects %s', (_name, options, message) => {
    expect(() =>
      normalizeInitOptions(options as InitGeneratorSchema),
    ).toThrow(message);
  });
});
