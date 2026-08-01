import { describe, expect, it } from 'vitest';

import {
  createApiTracePropagationMatcher,
  resolveBrowserTelemetryConfig,
} from './browser-config';

describe('browser telemetry configuration', () => {
  it('is disabled without an explicitly configured endpoint', () => {
    expect(
      resolveBrowserTelemetryConfig({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api',
      }),
    ).toEqual({
      enabled: false,
      apiOrigin: 'http://localhost:4000',
      deploymentEnvironment: 'development',
    });
  });

  it('normalizes a shared OTLP endpoint and API origin', () => {
    expect(
      resolveBrowserTelemetryConfig({
        NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api',
        NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT:
          'https://telemetry.example.test/otlp/',
        NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT: 'preview',
      }),
    ).toEqual({
      enabled: true,
      traceEndpoint: 'https://telemetry.example.test/otlp/v1/traces',
      apiOrigin: 'https://api.example.test',
      deploymentEnvironment: 'preview',
    });
  });

  it('honors the browser SDK disable switch', () => {
    expect(
      resolveBrowserTelemetryConfig({
        NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        NEXT_PUBLIC_OTEL_SDK_DISABLED: 'true',
      }).enabled,
    ).toBe(false);
  });

  it('matches API paths while rejecting lookalike origins', () => {
    const matcher = createApiTracePropagationMatcher(
      'https://api.example.test',
    );

    expect(matcher.test('https://api.example.test/api/agent-tasks')).toBe(true);
    expect(matcher.test('https://api.example.test')).toBe(true);
    expect(matcher.test('https://api.example.test.evil.test/api')).toBe(false);
  });
});
