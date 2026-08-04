import { describe, expect, it } from 'vitest';

import { validateProductionReadiness } from './production-readiness.mjs';

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
  AUTH_OIDC_AUDIENCE: 'agentic-api',
  AUTH_OIDC_ISSUER: 'https://identity.internal/tenant',
  BACKUP_OWNER: 'platform-operations',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.internal',
  OTEL_SERVICE_VERSION: '1.2.3',
};

describe('production telemetry readiness', () => {
  it('rejects disabled telemetry and unsafe signal-specific endpoints', () => {
    const issues = validateProductionReadiness(
      {
        ...validProduction,
        OTEL_SDK_DISABLED: 'true',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:
          'https://metrics.localhost/v1/metrics',
      },
      { nodeVersion: '24.18.0' },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        'OTEL_SDK_DISABLED must not disable telemetry in production.',
        'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must be a valid HTTPS URL for production.',
        'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must not use a local hostname in production.',
      ]),
    );
  });

  it('accepts secure signal-specific endpoint overrides', () => {
    expect(
      validateProductionReadiness(
        {
          ...validProduction,
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
            'https://traces.otel.internal/v1/traces',
          OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:
            'https://metrics.otel.internal/v1/metrics',
          OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:
            'https://logs.otel.internal/v1/logs',
        },
        { nodeVersion: '24.18.0' },
      ),
    ).toEqual([]);
  });
});
