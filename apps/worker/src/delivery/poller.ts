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
    } catch (error) {
      if (!stopped) {
        options.logger.error('worker.message.lease-renewal-failed', error);
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

export async function pollWorkerOnce(
  options: PollWorkerOptions,
): Promise<number> {
  const messages = await options.delivery.claim({
    workerId: options.workerId,
    batchSize: options.batchSize,
    leaseDurationMs: options.leaseDurationMs,
  });
  const dispatch = options.dispatch ?? dispatchOutboxMessage;
  const renewals = new Map(
    messages.map((message) => [
      message.id,
      startLeaseRenewal(message, options),
    ]),
  );

  try {
    for (const message of messages) {
      const renewal = renewals.get(message.id);
      try {
        const disposition = await dispatch(message, {
          delivery: options.delivery,
          ...(renewal ? { signal: renewal.signal } : {}),
        });
        options.logger.info('worker.message.completed', {
          attemptCount: message.attemptCount,
          disposition,
          eventKind: message.kind,
          outboxId: message.id,
        });
      } catch (error) {
        if (!renewal?.signal.aborted) {
          options.logger.error('worker.message.failed', error);
        }
      } finally {
        renewal?.stop();
        renewals.delete(message.id);
      }
    }
  } finally {
    for (const renewal of renewals.values()) renewal.stop();
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
