export type BrowserTelemetryEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface BrowserTelemetryConfig {
  readonly enabled: boolean;
  readonly traceEndpoint?: string;
  readonly apiOrigin: string;
  readonly deploymentEnvironment: string;
}

function normalizeTraceEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  const pathname = url.pathname.replace(/\/$/, '');
  url.pathname = `${pathname}/v1/traces`;
  return url.toString();
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

export function resolveBrowserTelemetryConfig(
  environment: BrowserTelemetryEnvironment,
): BrowserTelemetryConfig {
  const endpoint =
    environment.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    environment.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const disabled =
    environment.NEXT_PUBLIC_OTEL_SDK_DISABLED?.toLowerCase() === 'true';

  return {
    enabled: !disabled && Boolean(endpoint),
    ...(endpoint
      ? {
          traceEndpoint:
            environment.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
              ? endpoint
              : normalizeTraceEndpoint(endpoint),
        }
      : {}),
    apiOrigin: normalizeOrigin(
      environment.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    ),
    deploymentEnvironment:
      environment.NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT ?? 'development',
  };
}
