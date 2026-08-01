import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
  type Attributes,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

export type TelemetryEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface NodeTelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly environment?: TelemetryEnvironment;
}

export interface NodeTelemetryConfig {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly deploymentEnvironment: string;
  readonly traceEndpoint?: string;
  readonly metricEndpoint?: string;
  readonly metricExportIntervalMillis: number;
}

export interface NodeTelemetryHandle {
  readonly enabled: boolean;
  shutdown(): Promise<void>;
}

interface TelemetrySdk {
  start(): void;
  shutdown(): Promise<void>;
}

interface NodeTelemetryDependencies {
  createSdk(config: NodeTelemetryConfig): TelemetrySdk;
}

interface TelemetryState {
  readonly handles: Map<string, Promise<NodeTelemetryHandle>>;
}

const telemetryStateKey = Symbol.for('agentic-webapp.telemetry.state');

function getTelemetryState(): TelemetryState {
  const globalRecord = globalThis as typeof globalThis & {
    [telemetryStateKey]?: TelemetryState;
  };
  globalRecord[telemetryStateKey] ??= { handles: new Map() };
  return globalRecord[telemetryStateKey];
}

function normalizeBaseEndpoint(endpoint: string, signalPath: string): string {
  const url = new URL(endpoint);
  const pathname = url.pathname.replace(/\/$/, '');
  url.pathname = `${pathname}${signalPath}`;
  return url.toString();
}

function parseExportInterval(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 10_000;
}

export function resolveNodeTelemetryConfig(
  options: NodeTelemetryOptions,
): NodeTelemetryConfig {
  const environment = options.environment ?? process.env;
  const disabled = environment.OTEL_SDK_DISABLED?.toLowerCase() === 'true';
  const baseEndpoint = environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const traceEndpoint =
    environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    (baseEndpoint ? normalizeBaseEndpoint(baseEndpoint, '/v1/traces') : undefined);
  const metricEndpoint =
    environment.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() ||
    (baseEndpoint ? normalizeBaseEndpoint(baseEndpoint, '/v1/metrics') : undefined);

  return {
    enabled: !disabled && Boolean(traceEndpoint || metricEndpoint),
    serviceName: options.serviceName,
    serviceVersion:
      options.serviceVersion ?? environment.OTEL_SERVICE_VERSION ?? '0.1.0',
    deploymentEnvironment:
      environment.OTEL_DEPLOYMENT_ENVIRONMENT ??
      environment.NODE_ENV ??
      'development',
    ...(traceEndpoint ? { traceEndpoint } : {}),
    ...(metricEndpoint ? { metricEndpoint } : {}),
    metricExportIntervalMillis: parseExportInterval(
      environment.OTEL_METRIC_EXPORT_INTERVAL,
    ),
  };
}

const defaultDependencies: NodeTelemetryDependencies = {
  createSdk: (config) => {
    const metricReader = config.metricEndpoint
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: config.metricEndpoint }),
          exportIntervalMillis: config.metricExportIntervalMillis,
        })
      : undefined;

    return new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': config.serviceName,
        'service.version': config.serviceVersion,
        'deployment.environment.name': config.deploymentEnvironment,
      }),
      ...(config.traceEndpoint
        ? {
            traceExporter: new OTLPTraceExporter({
              url: config.traceEndpoint,
            }),
          }
        : {}),
      ...(metricReader ? { metricReader } : {}),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });
  },
};

export function startNodeTelemetry(
  options: NodeTelemetryOptions,
  dependencies: NodeTelemetryDependencies = defaultDependencies,
): Promise<NodeTelemetryHandle> {
  const config = resolveNodeTelemetryConfig(options);
  if (!config.enabled) {
    return Promise.resolve({
      enabled: false,
      shutdown: async () => undefined,
    });
  }

  const state = getTelemetryState();
  const existing = state.handles.get(config.serviceName);
  if (existing) return existing;

  const handle = Promise.resolve().then(() => {
    const sdk = dependencies.createSdk(config);
    sdk.start();
    return {
      enabled: true,
      shutdown: async () => {
        await sdk.shutdown();
        state.handles.delete(config.serviceName);
      },
    } satisfies NodeTelemetryHandle;
  });
  state.handles.set(config.serviceName, handle);
  return handle;
}

export function getActiveTraceParent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}

export interface RemoteTraceOptions {
  readonly name: string;
  readonly traceParent?: string;
  readonly attributes?: Attributes;
}

export async function runWithRemoteTrace<T>(
  options: RemoteTraceOptions,
  callback: () => Promise<T>,
): Promise<T> {
  const parentContext = options.traceParent
    ? propagation.extract(ROOT_CONTEXT, { traceparent: options.traceParent })
    : context.active();

  return trace
    .getTracer('@agentic-webapp/observability')
    .startActiveSpan(
      options.name,
      { kind: SpanKind.CONSUMER, attributes: options.attributes },
      parentContext,
      async (span) => {
        try {
          return await callback();
        } catch (error) {
          span.recordException(
            error instanceof Error ? error : new Error(String(error)),
          );
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
}
