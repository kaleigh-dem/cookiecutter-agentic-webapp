import { hostname } from 'node:os';

import {
  createDatabase,
  type DatabaseConnection,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';
import {
  createCorrelationContext,
  createStructuredLogger,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';

import { runWorkerLoop } from './delivery/poller';

const BATCH_SIZE = 10;
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

async function startWorker(): Promise<void> {
  const telemetry = await startNodeTelemetry({ serviceName: 'worker' });
  let database: DatabaseConnection | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let shutdownSignal: 'SIGINT' | 'SIGTERM' | undefined;
  const abortController = new AbortController();
  const workerId = `${hostname()}:${process.pid}`;

  const requestShutdown = (signal: 'SIGINT' | 'SIGTERM') => {
    if (abortController.signal.aborted) return;
    shutdownSignal = signal;
    logger.info('worker.shutdown.requested', { signal, workerId });
    abortController.abort();
  };
  const handleSigint = () => requestShutdown('SIGINT');
  const handleSigterm = () => requestShutdown('SIGTERM');
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  try {
    database = createDatabase({
      connectionString: requireDatabaseUrl(),
      applicationName: `worker:${workerId}`,
      maxConnections: BATCH_SIZE + 1,
    });
    const delivery = new PostgresOutboxDelivery(database.pool);

    heartbeat = setInterval(() => {
      runWithCorrelationContext(
        createCorrelationContext({ correlationId: 'worker-heartbeat' }),
        () => logger.info('worker.heartbeat', { workerId }),
      );
    }, HEARTBEAT_INTERVAL_MS);

    logger.info('worker.started', {
      batchSize: BATCH_SIZE,
      leaseDurationMs: LEASE_DURATION_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      telemetryEnabled: telemetry.enabled,
      workerId,
    });

    await runWorkerLoop({
      batchSize: BATCH_SIZE,
      delivery,
      leaseDurationMs: LEASE_DURATION_MS,
      logger,
      pollIntervalMs: POLL_INTERVAL_MS,
      signal: abortController.signal,
      workerId,
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
    await database?.close();
    await telemetry.shutdown();
    logger.info('worker.stopped', {
      signal: shutdownSignal ?? 'completed',
      workerId,
    });
  }
}

void startWorker().catch((error: unknown) => {
  logger.error('worker.start.failed', error);
  process.exitCode = 1;
});
