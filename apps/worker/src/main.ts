import { hostname } from 'node:os';

import {
  createDatabase,
  type DatabaseConnection,
  DrizzleAgentTaskExecutionStore,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';
import {
  createCorrelationContext,
  createStructuredLogger,
  MetricsRegistry,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';

import { runWorkerLoop } from './delivery/poller';
import { defaultRetryPolicy } from './delivery/retry-policy';
import { createStatefulExecuteAgentTaskHandler } from './jobs/execute-agent-task/stateful-handler';
import {
  startWorkerOperationsServer,
  type WorkerOperationsServerHandle,
} from './operations';

const BATCH_SIZE = 10;
const DEFAULT_DRAIN_TIMEOUT_MS = 25_000;
const DEFAULT_OPERATIONS_PORT = 4_001;
const HEARTBEAT_INTERVAL_MS = 30_000;
const LEASE_DURATION_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

const logger = createStructuredLogger('worker');

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to start the worker.');
  }
  return databaseUrl;
}

function boundedEnvironmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

async function startWorker(): Promise<void> {
  const telemetry = await startNodeTelemetry({ serviceName: 'worker' });
  let database: DatabaseConnection | undefined;
  let operations: WorkerOperationsServerHandle | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let drainTimer: NodeJS.Timeout | undefined;
  let shutdownSignal: 'SIGINT' | 'SIGTERM' | undefined;
  const stopController = new AbortController();
  const forceController = new AbortController();
  const metrics = new MetricsRegistry();
  const workerId = `${hostname()}:${process.pid}`;
  const drainTimeoutMs = boundedEnvironmentInteger(
    'WORKER_DRAIN_TIMEOUT_MS',
    DEFAULT_DRAIN_TIMEOUT_MS,
    1_000,
    300_000,
  );
  const operationsPort = boundedEnvironmentInteger(
    'WORKER_OPERATIONS_PORT',
    DEFAULT_OPERATIONS_PORT,
    1,
    65_535,
  );

  const requestShutdown = (signal: 'SIGINT' | 'SIGTERM') => {
    if (stopController.signal.aborted) return;
    shutdownSignal = signal;
    logger.info('worker.shutdown.requested', {
      drainTimeoutMs,
      signal,
      workerId,
    });
    stopController.abort(new Error(`Worker shutdown requested by ${signal}.`));
    drainTimer = setTimeout(() => {
      logger.warn('worker.shutdown.drain-timeout', {
        drainTimeoutMs,
        signal,
        workerId,
      });
      forceController.abort(
        new Error('The worker drain deadline expired before work completed.'),
      );
    }, drainTimeoutMs);
    drainTimer.unref();
  };
  const handleSigint = () => requestShutdown('SIGINT');
  const handleSigterm = () => requestShutdown('SIGTERM');
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  try {
    database = createDatabase({
      connectionString: requireDatabaseUrl(),
      applicationName: `worker:${workerId}`,
      maxConnections: BATCH_SIZE + 2,
    });
    const activeDatabase = database;
    const delivery = new PostgresOutboxDelivery(activeDatabase.pool);
    const executionStore = new DrizzleAgentTaskExecutionStore(
      activeDatabase.database,
    );
    const handleExecuteAgentTask =
      createStatefulExecuteAgentTaskHandler(executionStore);

    operations = await startWorkerOperationsServer({
      port: operationsPort,
      isAcceptingWork: () => !stopController.signal.aborted,
      dependencies: [
        {
          name: 'database',
          check: async () => {
            await activeDatabase.pool.query('select 1');
          },
        },
      ],
      metrics,
    });

    heartbeat = setInterval(() => {
      runWithCorrelationContext(
        createCorrelationContext({ correlationId: 'worker-heartbeat' }),
        () => logger.info('worker.heartbeat', { workerId }),
      );
    }, HEARTBEAT_INTERVAL_MS);

    logger.info('worker.started', {
      batchSize: BATCH_SIZE,
      drainTimeoutMs,
      leaseDurationMs: LEASE_DURATION_MS,
      operationsPort: operations.port,
      pollIntervalMs: POLL_INTERVAL_MS,
      retryBaseDelayMs: defaultRetryPolicy.baseDelayMs,
      retryJitterRatio: defaultRetryPolicy.jitterRatio,
      retryMaxAttempts: defaultRetryPolicy.maxAttempts,
      retryMaxDelayMs: defaultRetryPolicy.maxDelayMs,
      telemetryEnabled: telemetry.enabled,
      workerId,
    });

    await runWorkerLoop({
      batchSize: BATCH_SIZE,
      delivery,
      forceSignal: forceController.signal,
      handleExecuteAgentTask,
      leaseDurationMs: LEASE_DURATION_MS,
      logger,
      metrics,
      pollIntervalMs: POLL_INTERVAL_MS,
      retryPolicy: defaultRetryPolicy,
      signal: stopController.signal,
      workerId,
    });

    if (shutdownSignal) {
      logger.info('worker.shutdown.drained', {
        forced: forceController.signal.aborted,
        signal: shutdownSignal,
        workerId,
      });
    }
  } finally {
    if (drainTimer) clearTimeout(drainTimer);
    if (heartbeat) clearInterval(heartbeat);
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
    await operations?.close();
    await database?.close();
    await telemetry.shutdown();
    logger.info('worker.stopped', {
      signal: shutdownSignal ?? 'completed',
      workerId,
    });
  }
}

void startWorker().catch(() => {
  logger.error('worker.start.failed', new Error('The worker failed to start.'));
  process.exitCode = 1;
});
