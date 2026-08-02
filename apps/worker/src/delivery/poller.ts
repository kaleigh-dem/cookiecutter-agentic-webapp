import type {
  ClaimedOutboxMessage,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';
import {
  createCorrelationContext,
  runWithCorrelationContext,
  type CorrelationContext,
} from '@agentic-webapp/observability';

import { classifyJobFailure } from '../jobs/failure';
import {
  dispatchOutboxMessage,
  type DispatchOutboxMessageOptions,
  type ExecuteAgentTaskHandler,
} from './dispatch';
import {
  calculateRetryDelayMs,
  defaultRetryPolicy,
  type RetryPolicy,
  validateRetryPolicy,
} from './retry-policy';

export const workerMetricNames = {
  failures: 'worker_failures_total',
  oldestMessageAge: 'worker_oldest_message_age_ms',
  processingDuration: 'worker_message_processing_duration_ms',
  queueDepth: 'worker_queue_depth',
  retries: 'worker_retries_total',
} as const;

export interface WorkerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, error?: unknown): void;
}

export interface WorkerMetrics {
  increment(name: string, value?: number): void;
  observe(name: string, milliseconds: number): void;
  setGauge(name: string, value: number): void;
}

export interface PollWorkerOptions {
  readonly delivery: PostgresOutboxDelivery;
  readonly workerId: string;
  readonly batchSize: number;
  readonly leaseDurationMs: number;
  readonly logger: WorkerLogger;
  readonly metrics?: WorkerMetrics;
  readonly handleExecuteAgentTask?: ExecuteAgentTaskHandler;
  readonly retryPolicy?: RetryPolicy;
  readonly now?: () => Date;
  readonly performanceNow?: () => number;
  readonly random?: () => number;
  readonly stopSignal?: AbortSignal;
  readonly forceSignal?: AbortSignal;
  readonly dispatch?: (
    message: ClaimedOutboxMessage,
    options: DispatchOutboxMessageOptions,
  ) => Promise<'acknowledged' | 'quarantined'>;
}

interface LeaseRenewal {
  readonly signal: AbortSignal;
  stop(): void;
}

function claimReference(message: ClaimedOutboxMessage) {
  return {
    id: message.id,
    workerId: message.workerId,
    claimToken: message.claimToken,
  };
}

function stringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function messageCorrelationContext(
  message: ClaimedOutboxMessage,
): CorrelationContext {
  const actorId = stringField(message.payload, 'actorId');
  const userId = stringField(message.payload, 'userId') ?? actorId;
  const requestId = stringField(message.payload, 'requestId');
  const traceId = stringField(message.payload, 'traceId');

  return createCorrelationContext({
    ...(requestId ? { requestId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(userId ? { userId } : {}),
    ...(actorId ? { actorId } : {}),
    eventId: message.id,
    jobId: message.id,
    correlationId: message.correlationId,
  });
}

function startLeaseRenewal(
  message: ClaimedOutboxMessage,
  options: PollWorkerOptions,
): LeaseRenewal {
  const renewalIntervalMs = Math.max(
    1,
    Math.floor(options.leaseDurationMs / 3),
  );
  const claimLossMarginMs = Math.max(1, Math.floor(renewalIntervalMs / 2));
  const controller = new AbortController();
  let stopped = false;
  let renewalInFlight = false;
  let renewalTimer: ReturnType<typeof setInterval> | undefined;
  let claimLossTimer: ReturnType<typeof setTimeout> | undefined;

  const clearClaimLossTimer = () => {
    if (claimLossTimer) clearTimeout(claimLossTimer);
    claimLossTimer = undefined;
  };

  const stopTimers = () => {
    if (renewalTimer) clearInterval(renewalTimer);
    renewalTimer = undefined;
    clearClaimLossTimer();
  };

  const loseClaim = (reason: Error) => {
    if (stopped) return;
    stopped = true;
    stopTimers();
    controller.abort(reason);
    options.logger.error('worker.message.claim-lost', reason);
  };

  const scheduleClaimLoss = (claimExpiresAt: Date) => {
    if (stopped) return;
    clearClaimLossTimer();
    const delayMs = Math.max(
      0,
      claimExpiresAt.getTime() - Date.now() - claimLossMarginMs,
    );
    claimLossTimer = setTimeout(
      () =>
        loseClaim(
          new Error(
            `Outbox message ${message.id} did not renew before its lease safety deadline.`,
          ),
        ),
      delayMs,
    );
  };

  const renew = async () => {
    if (stopped || renewalInFlight) return;
    renewalInFlight = true;

    try {
      const claimExpiresAt = await options.delivery.renew({
        ...claimReference(message),
        leaseDurationMs: options.leaseDurationMs,
      });

      if (stopped) return;
      if (!claimExpiresAt) {
        loseClaim(
          new Error(
            `Unable to renew outbox message ${message.id}; the claim is no longer current.`,
          ),
        );
        return;
      }

      scheduleClaimLoss(claimExpiresAt);
      options.logger.info('worker.message.lease-renewed', {
        claimExpiresAt: claimExpiresAt.toISOString(),
        eventKind: message.kind,
        outboxId: message.id,
      });
    } catch {
      if (!stopped) {
        options.logger.error(
          'worker.message.lease-renewal-failed',
          new Error('The outbox lease renewal failed.'),
        );
      }
    } finally {
      renewalInFlight = false;
    }
  };

  scheduleClaimLoss(message.claimExpiresAt);
  renewalTimer = setInterval(() => void renew(), renewalIntervalMs);

  return {
    signal: controller.signal,
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopTimers();
    },
  };
}

async function settleDispatchFailure(
  message: ClaimedOutboxMessage,
  processingSignal: AbortSignal | undefined,
  error: unknown,
  options: PollWorkerOptions,
  retryPolicy: RetryPolicy,
): Promise<void> {
  if (processingSignal?.aborted) {
    options.logger.info('worker.message.abandoned', {
      attemptCount: message.attemptCount,
      eventKind: message.kind,
      outboxId: message.id,
      reason: options.forceSignal?.aborted ? 'drain-timeout' : 'claim-lost',
    });
    return;
  }

  const failure = classifyJobFailure(error);
  const exhausted = message.attemptCount >= retryPolicy.maxAttempts;

  if (failure.disposition === 'retryable' && !exhausted) {
    const retryDelayMs = calculateRetryDelayMs(
      message.attemptCount,
      retryPolicy,
      options.random,
    );
    const nextAttemptAt = new Date(
      (options.now?.() ?? new Date()).getTime() + retryDelayMs,
    );
    const updated = await options.delivery.reschedule({
      ...claimReference(message),
      nextAttemptAt,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
    });
    if (!updated) {
      options.logger.error(
        'worker.message.claim-lost',
        new Error('The outbox claim expired before retry could be scheduled.'),
      );
      return;
    }
    options.metrics?.increment(workerMetricNames.retries);
    options.logger.info('worker.message.retry-scheduled', {
      attemptCount: message.attemptCount,
      errorCode: failure.errorCode,
      eventKind: message.kind,
      nextAttemptAt: nextAttemptAt.toISOString(),
      outboxId: message.id,
      retryDelayMs,
    });
    return;
  }

  const updated = await options.delivery.fail({
    ...claimReference(message),
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
  });
  if (!updated) {
    options.logger.error(
      'worker.message.claim-lost',
      new Error('The outbox claim expired before dead-lettering completed.'),
    );
    return;
  }
  options.metrics?.increment(workerMetricNames.failures);
  options.logger.info('worker.message.dead-lettered', {
    attemptCount: message.attemptCount,
    errorCode: failure.errorCode,
    eventKind: message.kind,
    outboxId: message.id,
    reason: exhausted ? 'attempts-exhausted' : 'permanent-failure',
  });
}

async function refreshQueueMetrics(options: PollWorkerOptions): Promise<void> {
  if (!options.metrics) return;

  try {
    const queue = await options.delivery.getQueueMetrics();
    options.metrics.setGauge(workerMetricNames.queueDepth, queue.queueDepth);
    options.metrics.setGauge(
      workerMetricNames.oldestMessageAge,
      queue.oldestMessageAgeMs,
    );
  } catch {
    options.logger.error(
      'worker.metrics.refresh-failed',
      new Error('Unable to refresh worker queue metrics.'),
    );
  }
}

export async function pollWorkerOnce(
  options: PollWorkerOptions,
): Promise<number> {
  if (options.stopSignal?.aborted) return 0;

  const retryPolicy = validateRetryPolicy(
    options.retryPolicy ?? defaultRetryPolicy,
  );
  const messages = await options.delivery.claim({
    workerId: options.workerId,
    batchSize: options.batchSize,
    leaseDurationMs: options.leaseDurationMs,
  });
  const dispatch = options.dispatch ?? dispatchOutboxMessage;
  const contexts = new Map(
    messages.map((message) => [message.id, messageCorrelationContext(message)]),
  );
  const renewals = new Map(
    messages.map((message) => [
      message.id,
      runWithCorrelationContext(
        contexts.get(message.id) ?? messageCorrelationContext(message),
        () => startLeaseRenewal(message, options),
      ),
    ]),
  );

  try {
    for (const message of messages) {
      const renewal = renewals.get(message.id);
      const context =
        contexts.get(message.id) ?? messageCorrelationContext(message);

      await runWithCorrelationContext(context, async () => {
        const startedAt = options.performanceNow?.() ?? performance.now();
        const processingSignal = renewal
          ? options.forceSignal
            ? AbortSignal.any([renewal.signal, options.forceSignal])
            : renewal.signal
          : options.forceSignal;

        try {
          if (options.forceSignal?.aborted) {
            options.logger.info('worker.message.abandoned', {
              attemptCount: message.attemptCount,
              eventKind: message.kind,
              outboxId: message.id,
              reason: 'drain-timeout',
            });
            return;
          }

          const disposition = await dispatch(message, {
            delivery: options.delivery,
            maxAttempts: retryPolicy.maxAttempts,
            ...(options.handleExecuteAgentTask
              ? { handleExecuteAgentTask: options.handleExecuteAgentTask }
              : {}),
            ...(processingSignal ? { signal: processingSignal } : {}),
          });
          if (disposition === 'quarantined') {
            options.metrics?.increment(workerMetricNames.failures);
          }
          options.logger.info('worker.message.completed', {
            attemptCount: message.attemptCount,
            disposition,
            eventKind: message.kind,
            outboxId: message.id,
          });
        } catch (error) {
          try {
            await settleDispatchFailure(
              message,
              processingSignal,
              error,
              options,
              retryPolicy,
            );
          } catch {
            options.logger.error(
              'worker.message.disposition-failed',
              new Error('Unable to persist the outbox failure disposition.'),
            );
          }
        } finally {
          options.metrics?.observe(
            workerMetricNames.processingDuration,
            Math.max(
              0,
              (options.performanceNow?.() ?? performance.now()) - startedAt,
            ),
          );
          renewal?.stop();
          renewals.delete(message.id);
        }
      });
    }
  } finally {
    for (const renewal of renewals.values()) renewal.stop();
  }

  await refreshQueueMetrics(options);
  return messages.length;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export interface RunWorkerLoopOptions extends PollWorkerOptions {
  readonly pollIntervalMs: number;
  readonly signal: AbortSignal;
}

export async function runWorkerLoop(
  options: RunWorkerLoopOptions,
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await pollWorkerOnce({ ...options, stopSignal: options.signal });
    } catch {
      options.logger.error(
        'worker.poll.failed',
        new Error('The worker polling operation failed.'),
      );
    }

    if (!options.signal.aborted) {
      await sleep(options.pollIntervalMs, options.signal);
    }
  }
}
