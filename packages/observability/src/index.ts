import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationContext {
  requestId: string;
  traceId: string;
  userId?: string;
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
    const normalizedError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : error
          ? { name: 'Error', message: String(error) }
          : undefined;

    write({
      event,
      level,
      service,
      timestamp: new Date().toISOString(),
      ...(getCorrelationContext()
        ? { context: getCorrelationContext() }
        : {}),
      ...(attributes ? { attributes: redact(attributes) as Record<string, unknown> } : {}),
      ...(normalizedError ? { error: normalizedError } : {}),
    });
  };

  return {
    debug: (event, attributes) => emit('debug', event, attributes),
    info: (event, attributes) => emit('info', event, attributes),
    warn: (event, attributes) => emit('warn', event, attributes),
    error: (event, error, attributes) => emit('error', event, attributes, error),
  };
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, number[]>();

  public increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  public observe(name: string, milliseconds: number): void {
    const values = this.durations.get(name) ?? [];
    values.push(milliseconds);
    this.durations.set(name, values);
  }

  public snapshot(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      durations: Object.fromEntries(
        [...this.durations].map(([name, values]) => [name, {
          count: values.length,
          maxMs: values.length ? Math.max(...values) : 0,
          averageMs: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0,
        }]),
      ),
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
  const checks = Object.fromEntries(
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
