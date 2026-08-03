import { describe, expect, it } from 'vitest';

import {
  parseEnvironmentFile,
  validateDeploymentEnvironment,
} from './environment.mjs';

const validProduction = {
  DEPLOYMENT_ENVIRONMENT: 'production',
  APP_VERSION: '1.2.3',
  NODE_ENV: 'production',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://app:secret@database.internal:5432/app',
  WEB_ORIGIN: 'https://app.internal',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.internal',
  API_RATE_LIMIT_STORE: 'postgres',
  API_RATE_LIMIT_ANONYMOUS_MAX: '60',
  API_RATE_LIMIT_AUTHENTICATED_MAX: '120',
  API_RATE_LIMIT_ROUTE_MAX: '60',
  API_RATE_LIMIT_TENANT_MAX: '1000',
  API_RATE_LIMIT_WINDOW_MS: '60000',
  API_TRUSTED_PROXY_HOPS: '1',
};

describe('deployment environment validation', () => {
  it('parses comments, whitespace, and quoted values', () => {
    expect(
      parseEnvironmentFile(
        "# comment\n API_PORT = '4000' \nNODE_ENV=production\n",
      ),
    ).toEqual({ API_PORT: '4000', NODE_ENV: 'production' });
  });

  it('accepts a production environment with secure endpoints', () => {
    expect(validateDeploymentEnvironment(validProduction)).toEqual([]);
  });

  it('rejects development credentials and insecure production origins', () => {
    const issues = validateDeploymentEnvironment({
      ...validProduction,
      AUTH_DEVELOPMENT_TOKEN: 'local-development-token',
      WEB_ORIGIN: 'http://app.internal',
    });

    expect(issues).toContain(
      'AUTH_DEVELOPMENT_TOKEN must not be configured in production.',
    );
    expect(issues).toContain(
      'WEB_ORIGIN must use HTTPS outside local development.',
    );
  });

  it('rejects process-local production rate limiting and invalid proxy hops', () => {
    const issues = validateDeploymentEnvironment({
      ...validProduction,
      API_RATE_LIMIT_STORE: 'memory',
      API_TRUSTED_PROXY_HOPS: '11',
    });

    expect(issues).toContain(
      'Production requires API_RATE_LIMIT_STORE=postgres.',
    );
    expect(issues).toContain(
      'API_TRUSTED_PROXY_HOPS must be an integer from 0 to 10.',
    );
  });

  it('permits local HTTP only with the explicit local override', () => {
    expect(
      validateDeploymentEnvironment(
        {
          ...validProduction,
          DEPLOYMENT_ENVIRONMENT: 'preview',
          WEB_ORIGIN: 'http://localhost:3000',
          NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
        },
        { allowLocal: true },
      ),
    ).toEqual([]);
  });

  it('matches placeholder URL hosts structurally', () => {
    expect(
      validateDeploymentEnvironment({
        ...validProduction,
        WEB_ORIGIN: 'https://example.com',
      }),
    ).toContain('WEB_ORIGIN contains an example placeholder.');
    expect(
      validateDeploymentEnvironment({
        ...validProduction,
        NEXT_PUBLIC_API_BASE_URL: 'https://%65xample.com',
      }),
    ).toContain('NEXT_PUBLIC_API_BASE_URL contains an example placeholder.');
  });

  it('does not treat lookalike URL hosts as placeholders', () => {
    for (const webOrigin of [
      'https://notexample.com',
      'https://example.com.attacker.test',
    ]) {
      expect(
        validateDeploymentEnvironment({
          ...validProduction,
          WEB_ORIGIN: webOrigin,
        }),
      ).toEqual([]);
    }
  });
});
