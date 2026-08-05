import {
  metrics,
  type Counter,
  type Histogram,
  type ObservableGauge,
} from '@opentelemetry/api';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationContext {
  requestId: string;
  traceId: string;
  userId?: string;
  actorId?: string;
  eventId?: string;
  jobId?: string;
  correlationId?: string;
}

const contextStorage = new AsyncLocalStorage<CorrelationContext>();

export function createCorrelationContext(
  input: Partial<CorrelationContext> = {},
): CorrelationContext {
  return {
    requestId: input.requestId?.trim() || randomUUID(),
    traceId: input.traceId?.trim() || randomUUID().replaceAll('-', ''),
    ...(input.userId?.trim() ? { userId: input.userId.trim() } : {}),
    ...(input.actorId?.trim() ? { actorId: input.actorId.trim() } : {}),
    ...(input.eventId?.trim() ? { eventId: input.eventId.trim() } : {}),
    ...(input.jobId?.trim() ? { jobId: input.jobId.trim() } : {}),
    ...(input.correlationId?.trim()
      ? { correlationId: input.correlationId.trim() }
      : {}),
  };
}

export function runWithCorrelationContext<T>(
  context: CorrelationContext,
  callback: () => T,
): T {
  return contextStorage.run(context, callback);
}

export function getCorrelationContext(): CorrelationContext | undefined {
  return contextStorage.getStore();
}

const sensitiveKeys = new Set([
  'authorization',
  'cookie',
  'password',
  'prompt',
  'secret',
  'token',
]);

const sensitiveMessagePattern =
  /\b(authorization|cookie|password|prompt|secret|token)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi;

function redactText(value: string): string {
  return value.replace(
    sensitiveMessagePattern,
    (_match, key: string) => `${key}=[REDACTED]`,
  );
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? '[REDACTED]' : redact(nested),
    ]),
  );
}

export interface LogRecord {
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  timestamp: string;
  context?: CorrelationContext;
  attributes?: Record<string, unknown>;
  error?: { name: string; message: string };
}

export interface StructuredLogger {
  debug(event: string, attributes?: Record<string, unknown>): void;
  info(event: string, attributes?: Record<string, unknown>): void;
  warn(event: string, attributes?: Record<string, unknown>): void;
  error(
    event: string,
    error: unknown,
    attributes?: Record<string, unknown>,
  ): void;
}

export function createStructuredLogger(
  service: string,
  write: (record: LogRecord) => void = (record) =>
    console.log(JSON.stringify(record)),
): StructuredLogger {
  const emit = (
    level: LogRecord['level'],
    event: string,
    attributes?: Record<string, unknown>,
    error?: unknown,
  ) => {
    const context = getCorrelationContext();
    const normalizedError =
      error instanceof Error
        ? { name: error.name, message: redactText(error.message) }
        : error
          ? { name: 'Error', message: redactText(String(error)) }
          : undefined;

    write({
      event,
      level,
      service,
      timestamp: new Date().toISOString(),
      ...(context ? { context } : {}),
      ...(attributes
        ? { attributes: redact(attributes) as Record<string, unknown> }
        : {}),
      ...(normalizedError ? { error: normalizedError } : {}),
    });
  };

  return {
    debug: (event, attributes) => emit('debug', event, attributes),
    info: (event, attributes) => emit('info', event, attributes),
    warn: (event, attributes) => emit('warn', event, attributes),
    error: (event, error, attributes) =>
      emit('error', event, attributes, error),
  };
}

interface DurationAggregate {
  count: number;
  sumMs: number;
  maxMs: number;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, DurationAggregate>();
  private readonly gauges = new Map<string, number>();
  private readonly meter = metrics.getMeter('@steadystack/observability');
  private readonly exportedCounters = new Map<string, Counter>();
  private readonly exportedDurations = new Map<string, Histogram>();
  private readonly exportedGauges = new Map<string, ObservableGauge>();

  public increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
    const counter =
      this.exportedCounters.get(name) ?? this.meter.createCounter(name);
    this.exportedCounters.set(name, counter);
    counter.add(value);
  }

  public observe(name: string, milliseconds: number): void {
    const aggregate = this.durations.get(name) ?? {
      count: 0,
      sumMs: 0,
      maxMs: 0,
    };
    aggregate.count += 1;
    aggregate.sumMs += milliseconds;
    aggregate.maxMs = Math.max(aggregate.maxMs, milliseconds);
    this.durations.set(name, aggregate);

    const histogram =
      this.exportedDurations.get(name) ??
      this.meter.createHistogram(name, { unit: 'ms' });
    this.exportedDurations.set(name, histogram);
    histogram.record(milliseconds);
  }

  public setGauge(name: string, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`Gauge ${name} must be set to a finite number.`);
    }

    this.gauges.set(name, value);
    if (this.exportedGauges.has(name)) return;

    const gauge = this.meter.createObservableGauge(name);
    gauge.addCallback((result) => {
      result.observe(this.gauges.get(name) ?? 0);
    });
    this.exportedGauges.set(name, gauge);
  }

  public snapshot(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      durations: Object.fromEntries(
        [...this.durations].map(([name, aggregate]) => [
          name,
          {
            count: aggregate.count,
            sumMs: aggregate.sumMs,
            maxMs: aggregate.maxMs,
            averageMs:
              aggregate.count > 0 ? aggregate.sumMs / aggregate.count : 0,
          },
        ]),
      ),
      gauges: Object.fromEntries(this.gauges),
    };
  }
}

export interface DependencyProbe {
  name: string;
  check(): Promise<void>;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, { status: 'ok' | 'failed'; message?: string }>;
}

export async function checkDependencies(
  probes: readonly DependencyProbe[],
): Promise<HealthReport> {
  const checks: HealthReport['checks'] = Object.fromEntries(
    await Promise.all(
      probes.map(async (probe) => {
        try {
          await probe.check();
          return [probe.name, { status: 'ok' as const }];
        } catch (error) {
          return [
            probe.name,
            {
              status: 'failed' as const,
              message: error instanceof Error ? error.message : String(error),
            },
          ];
        }
      }),
    ),
  );

  return {
    status: Object.values(checks).every((check) => check.status === 'ok')
      ? 'ok'
      : 'degraded',
    checks,
  };
}
