import {
  createCorrelationContext,
  createStructuredLogger,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';

const logger = createStructuredLogger('worker');

function startWorker() {
  logger.info('worker.started');

  const interval = setInterval(() => {
    runWithCorrelationContext(
      createCorrelationContext({ correlationId: 'worker-heartbeat' }),
      () => logger.info('worker.heartbeat'),
    );
  }, 30_000);

  process.once('SIGTERM', () => {
    clearInterval(interval);
    logger.info('worker.stopped', { signal: 'SIGTERM' });
    process.exitCode = 0;
  });
}

startWorker();
