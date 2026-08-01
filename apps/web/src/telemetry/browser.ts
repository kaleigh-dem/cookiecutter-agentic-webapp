import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

import type { BrowserTelemetryConfig } from './browser-config';

let started = false;

export function startBrowserTelemetry(
  config: BrowserTelemetryConfig,
): boolean {
  if (!config.enabled || !config.traceEndpoint || started) return false;

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'web-browser',
      'service.version': '0.1.0',
      'deployment.environment.name': config.deploymentEnvironment,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: config.traceEndpoint }),
        {
          maxQueueSize: 100,
          maxExportBatchSize: 10,
          scheduledDelayMillis: 1_000,
          exportTimeoutMillis: 5_000,
        },
      ),
    ],
  });
  provider.register();
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [config.apiOrigin],
      }),
    ],
  });
  started = true;
  return true;
}
