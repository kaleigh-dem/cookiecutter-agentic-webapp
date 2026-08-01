import { describe, expect, it, vi } from 'vitest';

import { resolveNodeTelemetryConfig, startNodeTelemetry } from './telemetry';

describe('node telemetry', () => {
  it('remains disabled when no OTLP endpoint is configured', () => {
    expect(
      resolveNodeTelemetryConfig({
        serviceName: 'api',
        environment: { NODE_ENV: 'test' },
      }),
    ).toEqual({
      enabled: false,
      serviceName: 'api',
      serviceVersion: '0.1.0',
      deploymentEnvironment: 'test',
      metricExportIntervalMillis: 10_000,
    });
  });

  it('normalizes a shared OTLP HTTP endpoint for traces and metrics', () => {
    expect(
      resolveNodeTelemetryConfig({
        serviceName: 'worker',
        environment: {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/otel/',
          OTEL_METRIC_EXPORT_INTERVAL: '15000',
        },
      }),
    ).toMatchObject({
      enabled: true,
      traceEndpoint: 'http://collector:4318/otel/v1/traces',
      metricEndpoint: 'http://collector:4318/otel/v1/metrics',
      metricExportIntervalMillis: 15_000,
    });
  });

  it('honors the standard SDK disable switch', () => {
    expect(
      resolveNodeTelemetryConfig({
        serviceName: 'api',
        environment: {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
          OTEL_SDK_DISABLED: 'true',
        },
      }).enabled,
    ).toBe(false);
  });

  it('starts once per service and flushes on shutdown', async () => {
    const sdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = {
      createSdk: vi.fn(() => sdk),
    };
    const options = {
      serviceName: 'telemetry-lifecycle-test',
      environment: {
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      },
    } as const;

    const [first, second] = await Promise.all([
      startNodeTelemetry(options, dependencies),
      startNodeTelemetry(options, dependencies),
    ]);

    expect(first).toBe(second);
    expect(first.enabled).toBe(true);
    expect(dependencies.createSdk).toHaveBeenCalledOnce();
    expect(sdk.start).toHaveBeenCalledOnce();

    await first.shutdown();
    expect(sdk.shutdown).toHaveBeenCalledOnce();
  });
});
