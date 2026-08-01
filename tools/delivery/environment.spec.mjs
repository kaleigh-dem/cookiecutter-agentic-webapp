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
  REDIS_URL: 'rediss://:secret@redis.internal:6380',
  WEB_ORIGIN: 'https://app.internal',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.internal',
  API_RATE_LIMIT_MAX: '120',
  API_RATE_LIMIT_WINDOW_MS: '60000',
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
