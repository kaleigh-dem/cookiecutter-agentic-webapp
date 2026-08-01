import { resolveBrowserTelemetryConfig } from './telemetry/browser-config';

const config = resolveBrowserTelemetryConfig({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT:
    process.env.NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT,
  NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT:
    process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
  NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
    process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  NEXT_PUBLIC_OTEL_SDK_DISABLED: process.env.NEXT_PUBLIC_OTEL_SDK_DISABLED,
});

if (config.enabled) {
  void import('./telemetry/browser')
    .then(({ startBrowserTelemetry }) => startBrowserTelemetry(config))
    .catch(() => {
      console.error('Browser telemetry initialization failed.');
    });
}
