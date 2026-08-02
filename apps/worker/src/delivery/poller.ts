import type {
  ClaimedOutboxMessage,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';

import {
  dispatchOutboxMessage,
  type DispatchOutboxMessageOptions,
} from './dispatch';

export interface WorkerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, error?: unknown): void;
}

export interface PollWorkerOptions {
  readonly delivery: PostgresOutboxDelivery;
  readonly workerId: string;
  readonly batchSize: number;
  readonly leaseDurationMs: number;
  readonly logger: WorkerLogger;
  readonly dispatch?: (
    message: ClaimedOutboxMessage,
    options: DispatchOutboxMessageOptions,
  ) => Promise<'acknowledged' | 'quarantined'>;
}

function claimReference(message: ClaimedOutboxMessage) {
  return {
    id: message.id,
    workerId: message.workerId,
    claimToken: message.claimToken,
  };
}

function startLeaseRenewal(
  message: ClaimedOutboxMessage,
  options: PollWorkerOptions,
): () => void {
  const renewalIntervalMs = Math.max(
    1,
    Math.floor(options.leaseDurationMs / 2),
  );
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const renew = async () => {
    if (stopped) return;

    try {
      const claimExpiresAt = await options.delivery.renew({
        ...claimReference(message),
        leaseDurationMs: options.leaseDurationMs,
      });

      if (claimExpiresAt) {
        options.logger.info('worker.message.lease-renewed', {
          claimExpiresAt: claimExpiresAt.toISOString(),
          eventKind: message.kind,
          outboxId: message.id,
        });
      } else {
        options.logger.error(
          'worker.message.lease-renewal-failed',
          new Error(
            `Unable to renew outbox message ${message.id}; the claim is no longer current.`,
          ),
        );
      }
    } catch (error) {
      options.logger.error('worker.message.lease-renewal-failed', error);
    }

    if (!stopped) {
      timer = setTimeout(() => void renew(), renewalIntervalMs);
    }
  };

  timer = setTimeout(() => void renew(), renewalIntervalMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export async function pollWorkerOnce(
  options: PollWorkerOptions,
): Promise<number> {
  const messages = await options.delivery.claim({
    workerId: options.workerId,
    batchSize: options.batchSize,
    leaseDurationMs: options.leaseDurationMs,
  });
  const dispatch = options.dispatch ?? dispatchOutboxMessage;
  const stopRenewals = new Map(
    messages.map((message) => [message.id, startLeaseRenewal(message, options)]),
  );

  try {
    for (const message of messages) {
      try {
        const disposition = await dispatch(message, {
          delivery: options.delivery,
        });
        options.logger.info('worker.message.completed', {
          attemptCount: message.attemptCount,
          disposition,
          eventKind: message.kind,
          outboxId: message.id,
        });
      } catch (error) {
        options.logger.error('worker.message.failed', error);
      } finally {
        stopRenewals.get(message.id)?.();
        stopRenewals.delete(message.id);
      }
    }
  } finally {
    for (const stop of stopRenewals.values()) stop();
  }

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
      await pollWorkerOnce(options);
    } catch (error) {
      options.logger.error('worker.poll.failed', error);
    }

    if (!options.signal.aborted) {
      await sleep(options.pollIntervalMs, options.signal);
    }
  }
}
