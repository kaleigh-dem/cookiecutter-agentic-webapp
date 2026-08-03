import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  validateProductionReadiness,
  validateReleaseEnvironmentMatches,
} from './production-readiness.mjs';

const validProduction = {
  DEPLOYMENT_ENVIRONMENT: 'production',
  APP_VERSION: '1.2.3',
  NODE_ENV: 'production',
  API_PORT: '4000',
  DATABASE_URL:
    'postgresql://app:strong-secret@database.internal:5432/app?sslmode=require',
  WEB_ORIGIN: 'https://app.internal',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.internal',
  NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'oidc',
  NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: '/auth/session/access-token',
  API_RATE_LIMIT_STORE: 'postgres',
  API_RATE_LIMIT_ANONYMOUS_MAX: '60',
  API_RATE_LIMIT_AUTHENTICATED_MAX: '120',
  API_RATE_LIMIT_ROUTE_MAX: '60',
  API_RATE_LIMIT_TENANT_MAX: '1000',
  API_RATE_LIMIT_WINDOW_MS: '60000',
  API_TRUSTED_PROXY_HOPS: '1',
  AUTH_ACCESS_TOKEN_VERIFIER: 'oidc',
  AUTH_OIDC_ISSUER: 'https://identity.internal/tenant',
  BACKUP_OWNER: 'platform-operations',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.internal',
  OTEL_SERVICE_VERSION: '1.2.3',
};

describe('production readiness validation', () => {
  it('accepts a production-safe configuration on the supported runtime', () => {
    expect(
      validateProductionReadiness(validProduction, {
        nodeEngine: '>=24 <25',
        nodeVersion: 'v24.18.0',
      }),
    ).toEqual([]);
  });

  it('rejects development authentication and process-local controls', () => {
    const issues = validateProductionReadiness(
      {
        ...validProduction,
        AUTH_ACCESS_TOKEN_VERIFIER: 'development',
        AUTH_DEVELOPMENT_TOKEN: 'local-token',
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'development',
        API_RATE_LIMIT_STORE: 'memory',
      },
      { nodeVersion: '24.18.0' },
    );

    expect(issues).toContain(
      'Production requires AUTH_ACCESS_TOKEN_VERIFIER=oidc.',
    );
    expect(issues).toContain(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE must be oidc, session, or none in production.',
    );
    expect(issues).toContain(
      'Production readiness requires distributed PostgreSQL rate limiting.',
    );
    expect(issues).toContain(
      'AUTH_DEVELOPMENT_TOKEN must not be configured in production.',
    );
  });

  it('rejects local URLs and a CORS value that is not an origin', () => {
    const issues = validateProductionReadiness(
      {
        ...validProduction,
        DATABASE_URL:
          'postgresql://app:secret@localhost:5432/app?sslmode=require',
        WEB_ORIGIN: 'https://app.internal/dashboard',
        NEXT_PUBLIC_API_BASE_URL: 'https://localhost:4000',
      },
      { nodeVersion: '24.18.0' },
    );

    expect(issues).toContain(
      'WEB_ORIGIN must be an origin without a path, query, or fragment.',
    );
    expect(issues).toContain(
      'NEXT_PUBLIC_API_BASE_URL must not use a local hostname in production.',
    );
    expect(issues).toContain(
      'DATABASE_URL must not use a local hostname in production.',
    );
  });

  it('requires telemetry alignment and accountable backup ownership', () => {
    const issues = validateProductionReadiness(
      {
        ...validProduction,
        BACKUP_OWNER: 'team@example.com',
        OTEL_SERVICE_VERSION: '9.9.9',
      },
      { nodeVersion: '24.18.0' },
    );

    expect(issues).toContain(
      'BACKUP_OWNER must name a real accountable team or person.',
    );
    expect(issues).toContain('OTEL_SERVICE_VERSION must match APP_VERSION.');
  });

  it('requires database TLS and a supported Node runtime', () => {
    const issues = validateProductionReadiness(
      {
        ...validProduction,
        DATABASE_URL: 'postgresql://app:secret@database.internal:5432/app',
      },
      { nodeEngine: '>=24 <25', nodeVersion: '26.0.0' },
    );

    expect(issues).toContain(
      'DATABASE_URL must require TLS with sslmode=require, verify-ca, or verify-full.',
    );
    expect(issues).toContain(
      'Node 26.0.0 does not satisfy the production engine >=24 <25.',
    );
  });

  it('rejects release image settings that differ from the validated file', () => {
    expect(
      validateReleaseEnvironmentMatches(validProduction, {
        APP_VERSION: '1.2.4',
        NEXT_PUBLIC_API_BASE_URL: validProduction.NEXT_PUBLIC_API_BASE_URL,
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'session',
        NEXT_PUBLIC_AUTH_SESSION_ENDPOINT:
          validProduction.NEXT_PUBLIC_AUTH_SESSION_ENDPOINT,
      }),
    ).toEqual([
      'APP_VERSION does not match the release image build configuration.',
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE does not match the release image build configuration.',
    ]);
  });

  it('wires the gate into package scripts, release automation, and the production contract', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const workflow = readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8',
    );
    const environment = readFileSync(
      new URL(
        '../../infra/environments/production.env.example',
        import.meta.url,
      ),
      'utf8',
    );

    expect(packageJson.scripts['production:check']).toBe(
      'node tools/delivery/production-check.mjs',
    );
    expect(workflow).toContain('secrets.PRODUCTION_ENVIRONMENT');
    expect(workflow).toContain('--compare-release-environment');
    expect(environment).toContain('BACKUP_OWNER=');
  });
});
