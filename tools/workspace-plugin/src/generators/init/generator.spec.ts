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
      'initialize:workspace':
        'nx g @agentic-webapp/workspace-plugin:init',
    },
    devDependencies: {
      '@agentic-webapp/workspace-plugin': 'workspace:*',
    },
  });
  writeJson(tree, 'tools/workspace-plugin/package.json', {
    name: '@agentic-webapp/workspace-plugin',
  });
  writeJson(tree, 'tsconfig.base.json', {
    compilerOptions: {
      customConditions: ['@agentic-webapp/source'],
    },
  });
  writeJson(tree, 'tsconfig.json', {
    files: [],
    references: [
      { path: './apps/api' },
      { path: './apps/web' },
      { path: './apps/worker' },
      { path: './packages/contracts' },
    ],
  });
  for (const application of ['api', 'web', 'worker']) {
    writeJson(tree, `apps/${application}/project.json`, {
      name: application,
    });
  }
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
  tree.write(
    'infra/deploy/compose.preview.yaml',
    [
      'name: agentic-webapp-preview',
      'services:',
      '  postgres:',
      '    environment:',
      '      POSTGRES_DB: app',
      "    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres -d app'] }",
      '',
    ].join('\n'),
  );
  tree.write(
    'infra/deploy/compose.production.yaml',
    [
      'name: agentic-webapp-production',
      'services:',
      '  api:',
      '    image: ghcr.io/example/agentic-webapp-api:latest',
      '    labels:',
      '      app.agentic-webapp/version: latest',
      '',
    ].join('\n'),
  );
  tree.write(
    'packages/database/src/client.ts',
    "export const applicationName = 'agentic-webapp-database-client';\n",
  );
  tree.write(
    'packages/observability/src/service.ts',
    "export const serviceName = 'agentic-webapp-api';\n",
  );
  tree.write(
    'README.md',
    'Upstream template: https://github.com/kaleigh-dem/cookiecutter-agentic-webapp\n',
  );
  tree.write('.github/CODEOWNERS', '* @kaleigh-dem\n');
  return tree;
}

describe('init generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createWorkspaceTree();
  });

  it('writes an identity-neutral workspace and versioned manifest', async () => {
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
        "schemaVersion": 2,
        "upstream": {
          "repository": "kaleigh-dem/cookiecutter-agentic-webapp",
        },
      }
    `);

    const packageJson = readJson<{
      name: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(tree, 'package.json');
    expect(packageJson.name).toBe('@acme/customer-portal');
    expect(packageJson.scripts['containers:build']).toBe(
      'nx run-many -t container --projects=web,api,worker --parallel=1',
    );
    expect(packageJson.scripts['initialize:workspace']).toBe(
      'nx g @acme/workspace-plugin:init',
    );
    expect(packageJson.devDependencies).toHaveProperty(
      '@acme/workspace-plugin',
      'workspace:*',
    );

    expect(
      readJson<{ name: string }>(tree, 'tools/workspace-plugin/package.json')
        .name,
    ).toBe('@acme/workspace-plugin');
    expect(
      readJson<{
        compilerOptions: { customConditions: string[] };
      }>(tree, 'tsconfig.base.json').compilerOptions.customConditions,
    ).toEqual(['@acme/source']);
    expect(tree.read('infra/deploy/compose.preview.yaml', 'utf-8')).toContain(
      'name: customer-portal-preview',
    );
    expect(tree.read('infra/deploy/compose.preview.yaml', 'utf-8')).toContain(
      'POSTGRES_DB: customer_portal',
    );
    expect(tree.read('infra/deploy/compose.preview.yaml', 'utf-8')).toContain(
      'pg_isready -U postgres -d customer_portal',
    );
    expect(
      tree.read('infra/deploy/compose.production.yaml', 'utf-8'),
    ).toContain('app.customer-portal/version');
    expect(
      tree.read('infra/deploy/compose.production.yaml', 'utf-8'),
    ).toContain('ghcr.io/example/customer-portal-api:latest');
    expect(tree.read('packages/database/src/client.ts', 'utf-8')).toContain(
      'customer-portal-database-client',
    );
    expect(
      tree.read('packages/observability/src/service.ts', 'utf-8'),
    ).toContain('customer-portal-api');
    expect(tree.read('README.md', 'utf-8')).toContain(
      'https://github.com/kaleigh-dem/cookiecutter-agentic-webapp',
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

  it('is deterministic when initialization is repeated', async () => {
    await initGenerator(tree, validOptions);
    const first = [
      tree.read('package.json', 'utf-8'),
      tree.read('tsconfig.base.json', 'utf-8'),
      tree.read('infra/deploy/compose.production.yaml', 'utf-8'),
      tree.read('workspace.template.json', 'utf-8'),
    ];

    await initGenerator(tree, validOptions);
    const second = [
      tree.read('package.json', 'utf-8'),
      tree.read('tsconfig.base.json', 'utf-8'),
      tree.read('infra/deploy/compose.production.yaml', 'utf-8'),
      tree.read('workspace.template.json', 'utf-8'),
    ];

    expect(second).toEqual(first);
  });

  it('removes application projects that are not selected', async () => {
    await initGenerator(tree, {
      applicationSlug: 'docs-site',
      packageScope: '@acme',
      repositoryOwner: 'acme',
      applications: 'web',
      skipFormat: true,
    });

    expect(tree.exists('apps/web/project.json')).toBe(true);
    expect(tree.exists('apps/api/project.json')).toBe(false);
    expect(tree.exists('apps/worker/project.json')).toBe(false);
    expect(
      readJson<{ references: Array<{ path: string }> }>(tree, 'tsconfig.json')
        .references,
    ).toEqual([
      { path: './apps/web' },
      { path: './packages/contracts' },
    ]);
    expect(
      readJson<{ scripts: Record<string, string> }>(tree, 'package.json').scripts[
        'containers:build'
      ],
    ).toBe('nx run-many -t container --projects=web --parallel=1');
  });

  it('normalizes list ordering and produces deterministic manifests', () => {
    const first = createWorkspaceManifest(normalizeInitOptions(validOptions));
    const second = createWorkspaceManifest(
      normalizeInitOptions({
        ...validOptions,
        codeowners: ['@acme/platform', '@acme/security', '@acme/platform'],
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
    ['duplicate ports', { ...validOptions, apiPort: 3100 }, 'must be unique'],
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
    expect(() => normalizeInitOptions(options as InitGeneratorSchema)).toThrow(
      message,
    );
  });
});
