import type {
  ClaimedOutboxMessage,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';
import { describe, expect, it, vi } from 'vitest';

import type { DispatchOutboxMessageOptions } from './dispatch';
import { pollWorkerOnce, type WorkerLogger } from './poller';
import { PermanentJobError, RetryableJobError } from '../jobs/failure';

function message(
  id: string,
  overrides: Partial<ClaimedOutboxMessage> = {},
): ClaimedOutboxMessage {
  return {
    id,
    kind: 'agent-task.execute.v2',
    payload: {
      version: 2,
      taskId: '22222222-2222-4222-8222-222222222222',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Execute the task',
      requestId: `request-${id}`,
      traceId: '33333333333333333333333333333333',
      jobId: id,
      correlationId: `correlation-${id}`,
      occurredAt: '2026-08-02T12:00:00.000Z',
    },
    correlationId: `correlation-${id}`,
    attemptCount: 1,
    nextAttemptAt: new Date('2026-08-02T12:00:00.000Z'),
    workerId: 'worker-1',
    claimToken: '44444444-4444-4444-8444-444444444444',
    claimExpiresAt: new Date(Date.now() + 30_000),
    createdAt: new Date('2026-08-02T11:59:00.000Z'),
    ...overrides,
  };
}

function logger() {
  const info = vi.fn();
  const error = vi.fn();
  return { info, error, logger: { info, error } satisfies WorkerLogger };
}

describe('pollWorkerOnce', () => {
  it('claims a bounded batch and dispatches each message', async () => {
    const messages = [
      message('11111111-1111-4111-8111-111111111111'),
      message('55555555-5555-4555-8555-555555555555'),
    ];
    const claim = vi.fn(async () => messages);
    const dispatch = vi.fn(async () => 'acknowledged' as const);
    const { info, logger: workerLogger } = logger();

    await expect(
      pollWorkerOnce({
        batchSize: 10,
        delivery: { claim } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        workerId: 'worker-1',
      }),
    ).resolves.toBe(2);

    expect(claim).toHaveBeenCalledWith({
      workerId: 'worker-1',
      batchSize: 10,
      leaseDurationMs: 30_000,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      messages[0],
      expect.objectContaining({ maxAttempts: 5 }),
    );
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('renews processing and queued claims until each message completes', async () => {
    vi.useFakeTimers();
    try {
      const first = message('11111111-1111-4111-8111-111111111111');
      const second = message('55555555-5555-4555-8555-555555555555');
      const claim = vi.fn(async () => [first, second]);
      const renew = vi.fn(async () => new Date(Date.now() + 30_000));
      let completeFirst: (() => void) | undefined;
      const dispatch = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<'acknowledged'>((resolve) => {
              completeFirst = () => resolve('acknowledged');
            }),
        )
        .mockResolvedValueOnce('acknowledged');
      const { logger: workerLogger } = logger();

      const polling = pollWorkerOnce({
        batchSize: 10,
        delivery: { claim, renew } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        workerId: 'worker-1',
      });

      await vi.advanceTimersByTimeAsync(10_000);

      expect(renew).toHaveBeenCalledTimes(2);
      expect(renew).toHaveBeenCalledWith({
        id: first.id,
        workerId: first.workerId,
        claimToken: first.claimToken,
        leaseDurationMs: 30_000,
      });
      expect(renew).toHaveBeenCalledWith({
        id: second.id,
        workerId: second.workerId,
        claimToken: second.claimToken,
        leaseDurationMs: 30_000,
      });

      completeFirst?.();
      await expect(polling).resolves.toBe(2);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(renew).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed renewal before the current lease expires without logging secrets', async () => {
    vi.useFakeTimers();
    try {
      const claimed = message('11111111-1111-4111-8111-111111111111');
      const claim = vi.fn(async () => [claimed]);
      const renew = vi
        .fn(async () => new Date(Date.now() + 30_000))
        .mockRejectedValueOnce(
          new Error('Authorization: Bearer secret-token from database'),
        );
      let complete: (() => void) | undefined;
      const dispatch = vi.fn(
        () =>
          new Promise<'acknowledged'>((resolve) => {
            complete = () => resolve('acknowledged');
          }),
      );
      const { error, logger: workerLogger } = logger();

      const polling = pollWorkerOnce({
        batchSize: 1,
        delivery: { claim, renew } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        workerId: 'worker-1',
      });

      await vi.advanceTimersByTimeAsync(20_000);

      expect(renew).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        'worker.message.lease-renewal-failed',
        expect.objectContaining({
          message: 'The outbox lease renewal failed.',
        }),
      );
      expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token');

      complete?.();
      await expect(polling).resolves.toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts processing before expiry when renewal remains in flight', async () => {
    vi.useFakeTimers();
    try {
      const claimed = message('11111111-1111-4111-8111-111111111111');
      const claim = vi.fn(async () => [claimed]);
      let completeRenewal: ((value: Date | null) => void) | undefined;
      const renew = vi.fn(
        () =>
          new Promise<Date | null>((resolve) => {
            completeRenewal = resolve;
          }),
      );
      const dispatch = vi.fn(
        (
          _message: ClaimedOutboxMessage,
          options: DispatchOutboxMessageOptions,
        ) =>
          new Promise<'acknowledged'>((_resolve, reject) => {
            const signal = options.signal;
            if (!signal) {
              reject(new Error('Expected a claim cancellation signal.'));
              return;
            }
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      );
      const { error, logger: workerLogger } = logger();

      const polling = pollWorkerOnce({
        batchSize: 1,
        delivery: { claim, renew } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        workerId: 'worker-1',
      });

      await vi.advanceTimersByTimeAsync(10_000);
      expect(renew).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(14_999);
      expect(
        error.mock.calls.some(
          ([event]) => event === 'worker.message.claim-lost',
        ),
      ).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(polling).resolves.toBe(1);

      expect(renew).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        'worker.message.claim-lost',
        expect.objectContaining({
          message: expect.stringContaining('lease safety deadline'),
        }),
      );

      completeRenewal?.(new Date(Date.now() + 30_000));
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reschedules retryable failures with bounded backoff and continues the batch', async () => {
    const now = new Date('2026-08-02T12:00:00.000Z');
    const first = message('11111111-1111-4111-8111-111111111111', {
      attemptCount: 2,
    });
    const second = message('55555555-5555-4555-8555-555555555555');
    const claim = vi.fn(async () => [first, second]);
    const reschedule = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new RetryableJobError('dependency_unavailable'))
      .mockResolvedValueOnce('acknowledged');
    const { error, info, logger: workerLogger } = logger();

    await expect(
      pollWorkerOnce({
        batchSize: 10,
        delivery: {
          claim,
          reschedule,
          fail,
        } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        now: () => now,
        random: () => 0,
        workerId: 'worker-1',
      }),
    ).resolves.toBe(2);

    expect(reschedule).toHaveBeenCalledWith({
      id: first.id,
      workerId: first.workerId,
      claimToken: first.claimToken,
      nextAttemptAt: new Date('2026-08-02T12:00:01.000Z'),
      errorCode: 'dependency_unavailable',
      errorMessage: 'Agent Task execution failed temporarily.',
    });
    expect(fail).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith(
      'worker.message.retry-scheduled',
      expect.objectContaining({ retryDelayMs: 1_000 }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('dead-letters permanent failures immediately', async () => {
    const claimed = message('11111111-1111-4111-8111-111111111111');
    const claim = vi.fn(async () => [claimed]);
    const reschedule = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    const dispatch = vi.fn(async () => {
      throw new PermanentJobError('business_rule_rejected');
    });
    const { info, logger: workerLogger } = logger();

    await pollWorkerOnce({
      batchSize: 1,
      delivery: {
        claim,
        reschedule,
        fail,
      } as unknown as PostgresOutboxDelivery,
      dispatch,
      leaseDurationMs: 30_000,
      logger: workerLogger,
      workerId: 'worker-1',
    });

    expect(reschedule).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith({
      id: claimed.id,
      workerId: claimed.workerId,
      claimToken: claimed.claimToken,
      errorCode: 'business_rule_rejected',
      errorMessage: 'Agent Task execution failed permanently.',
    });
    expect(info).toHaveBeenCalledWith(
      'worker.message.dead-lettered',
      expect.objectContaining({ reason: 'permanent-failure' }),
    );
  });

  it('dead-letters retryable failures after the bounded attempt limit', async () => {
    const claimed = message('11111111-1111-4111-8111-111111111111', {
      attemptCount: 5,
    });
    const claim = vi.fn(async () => [claimed]);
    const reschedule = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    const dispatch = vi.fn(async () => {
      throw new RetryableJobError('dependency_timeout');
    });
    const { info, logger: workerLogger } = logger();

    await pollWorkerOnce({
      batchSize: 1,
      delivery: {
        claim,
        reschedule,
        fail,
      } as unknown as PostgresOutboxDelivery,
      dispatch,
      leaseDurationMs: 30_000,
      logger: workerLogger,
      workerId: 'worker-1',
    });

    expect(reschedule).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'dependency_timeout' }),
    );
    expect(info).toHaveBeenCalledWith(
      'worker.message.dead-lettered',
      expect.objectContaining({ reason: 'attempts-exhausted' }),
    );
  });

  it('surfaces claim failures to the outer polling loop', async () => {
    const claim = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const { logger: workerLogger } = logger();

    await expect(
      pollWorkerOnce({
        batchSize: 10,
        delivery: { claim } as unknown as PostgresOutboxDelivery,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        workerId: 'worker-1',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
