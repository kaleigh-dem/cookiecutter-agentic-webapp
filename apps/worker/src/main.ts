import {
  createCorrelationContext,
  createStructuredLogger,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import { startNodeTelemetry } from '@agentic-webapp/observability/telemetry';

const logger = createStructuredLogger('worker');

async function startWorker() {
  const telemetry = await startNodeTelemetry({ serviceName: 'worker' });
  logger.info('worker.started', { telemetryEnabled: telemetry.enabled });

  const interval = setInterval(() => {
    runWithCorrelationContext(
      createCorrelationContext({ correlationId: 'worker-heartbeat' }),
      () => logger.info('worker.heartbeat'),
    );
  }, 30_000);

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    clearInterval(interval);
    logger.info('worker.stopped', { signal });
    await telemetry.shutdown();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void startWorker().catch((error: unknown) => {
  logger.error('worker.start.failed', error);
  process.exitCode = 1;
});
