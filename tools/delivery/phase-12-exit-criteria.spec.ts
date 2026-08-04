import { readJson, type Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// This phase gate intentionally composes the public template generator with delivery validation.
// eslint-disable-next-line @nx/enforce-module-boundaries
import initGenerator from '@agentic-webapp/workspace-plugin/src/generators/init/generator';
import { parseEnvironmentFile } from './environment.mjs';
import { validateProductionReadiness } from './production-readiness.mjs';

function createTemplateTree(): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', {
    name: '@agentic-webapp/source',
    scripts: {
      build: 'nx run-many -t build',
      'containers:build': 'old-command',
      'initialize:workspace': 'nx g @agentic-webapp/workspace-plugin:init',
    },
    devDependencies: {
      '@agentic-webapp/workspace-plugin': 'workspace:*',
    },
  });
  writeJson(tree, 'tools/workspace-plugin/package.json', {
    name: '@agentic-webapp/workspace-plugin',
  });
  writeJson(tree, 'tsconfig.base.json', {
    compilerOptions: { customConditions: ['@agentic-webapp/source'] },
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
    writeJson(tree, `apps/${application}/project.json`, { name: application });
  }
  tree.write(
    '.env.example',
    [
      'WEB_PORT=3000',
      'API_PORT=4000',
      'WEB_ORIGIN=http://localhost:3000',
      'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000',
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE=development',
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=',
      'AUTH_ACCESS_TOKEN_VERIFIER=development',
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app',
      'OTEL_EXPORTER_OTLP_ENDPOINT=',
      'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=',
      '',
    ].join('\n'),
  );
  tree.write(
    'infra/environments/production.env.example',
    readFileSync(
      new URL(
        '../../infra/environments/production.env.example',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  tree.write(
    'infra/deploy/compose.preview.yaml',
    [
      'name: agentic-webapp-preview',
      'services:',
      '  postgres:',
      '    environment:',
      '      POSTGRES_DB: app',
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
      '',
    ].join('\n'),
  );
  tree.write(
    'README.md',
    'Upstream template: https://github.com/kaleigh-dem/nx-fullstack-platform\n',
  );
  tree.write('.github/CODEOWNERS', '* @template-owner\n');
  return tree;
}

function productionValues(
  generated: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    ...generated,
    APP_VERSION: '1.2.3',
    DATABASE_URL:
      'postgresql://app:strong-secret@database.internal:5432/customer_portal?sslmode=require',
    WEB_ORIGIN: 'https://app.internal',
    NEXT_PUBLIC_API_BASE_URL: 'https://api.internal',
    AUTH_OIDC_ISSUER: 'https://identity.internal/tenant',
    BACKUP_OWNER: 'platform-operations',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.internal',
    OTEL_SERVICE_VERSION: '1.2.3',
  };
}

describe('Phase 12 exit criteria', () => {
  it('generates a production-safe OIDC profile and rejects development adapters', async () => {
    const tree = createTemplateTree();
    await initGenerator(tree, {
      applicationSlug: 'customer-portal',
      displayName: 'Customer Portal',
      packageScope: '@acme',
      repositoryOwner: 'acme-platform',
      codeowners: '@acme/security,@acme/platform',
      applications: 'web,api,worker',
      authentication: 'oidc',
      workerTransport: 'postgres',
      telemetry: true,
      deploymentProfile: 'containers',
      ai: false,
      skipFormat: true,
    });

    expect(
      readJson<{
        profiles: {
          authentication: string;
          deployment: string;
          workerTransport: string;
        };
      }>(tree, 'workspace.template.json').profiles,
    ).toMatchObject({
      authentication: 'oidc',
      deployment: 'containers',
      workerTransport: 'postgres',
    });
    expect(tree.read('.env.example', 'utf8')).toContain(
      'AUTH_ACCESS_TOKEN_VERIFIER=oidc',
    );

    const generatedProduction = parseEnvironmentFile(
      tree.read('infra/environments/production.env.example', 'utf8') ?? '',
    );
    const safeProduction = productionValues(generatedProduction);
    expect(
      validateProductionReadiness(safeProduction, {
        nodeEngine: '>=24 <25',
        nodeVersion: '24.18.0',
      }),
    ).toEqual([]);

    const developmentIssues = validateProductionReadiness(
      {
        ...safeProduction,
        AUTH_ACCESS_TOKEN_VERIFIER: 'development',
        AUTH_DEVELOPMENT_TOKEN: 'local-token',
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'development',
        API_RATE_LIMIT_STORE: 'memory',
      },
      { nodeEngine: '>=24 <25', nodeVersion: '24.18.0' },
    );
    expect(developmentIssues).toEqual(
      expect.arrayContaining([
        'Production requires AUTH_ACCESS_TOKEN_VERIFIER=oidc.',
        'NEXT_PUBLIC_AUTHENTICATION_PROFILE must be oidc, session, or none in production.',
        'Production readiness requires distributed PostgreSQL rate limiting.',
        'AUTH_DEVELOPMENT_TOKEN must not be configured in production.',
      ]),
    );
  });

  it('keeps every behavioral proof in the generated validation contract', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const securityIntegration = readFileSync(
      new URL(
        '../../apps/api/src/app/security/security.integration.spec.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const contractIntegration = readFileSync(
      new URL(
        '../../apps/api/src/app/http-contract/http-contract.interceptor.spec.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const distributedLimitIntegration = readFileSync(
      new URL(
        '../../packages/database/src/adapters/postgres-rate-limit.integration.test.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(packageJson.scripts.check).toContain('pnpm test');
    expect(securityIntegration).toContain(
      'rejects expired, wrong-issuer, and wrong-audience access tokens',
    );
    expect(securityIntegration).toContain(
      'refreshes JWKS once when a provider rotates signing keys',
    );
    expect(contractIntegration).toContain(
      'rejects %s request bodies with field-level errors',
    );
    expect(contractIntegration).toContain(
      'fails closed when a handler produces an invalid response',
    );
    expect(distributedLimitIntegration).toContain(
      'shares one atomic window across independent API connections',
    );
  });
});
