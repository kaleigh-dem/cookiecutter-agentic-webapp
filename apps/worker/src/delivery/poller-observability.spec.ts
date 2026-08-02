import type {
  ClaimedOutboxMessage,
  PostgresOutboxDelivery,
} from '@agentic-webapp/database';
import { getCorrelationContext } from '@agentic-webapp/observability';
import { describe, expect, it, vi } from 'vitest';

import { PermanentJobError, RetryableJobError } from '../jobs/failure';
import type { DispatchOutboxMessageOptions } from './dispatch';
import {
  pollWorkerOnce,
  runWorkerLoop,
  workerMetricNames,
  type WorkerLogger,
  type WorkerMetrics,
} from './poller';

function message(
  id = '11111111-1111-4111-8111-111111111111',
  overrides: Partial<ClaimedOutboxMessage> = {},
): ClaimedOutboxMessage {
  return {
    id,
    kind: 'agent-task.execute.v2',
    payload: {
      version: 2,
      taskId: '22222222-2222-4222-8222-222222222222',
      actorId: 'actor-1',
      userId: 'user-1',
      prompt: 'Execute the task',
      requestId: 'request-1',
      traceId: '33333333333333333333333333333333',
      jobId: id,
      correlationId: 'correlation-1',
      occurredAt: '2026-08-02T12:00:00.000Z',
    },
    correlationId: 'correlation-1',
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

function metrics() {
  const increment = vi.fn();
  const observe = vi.fn();
  const setGauge = vi.fn();
  return {
    increment,
    observe,
    setGauge,
    metrics: { increment, observe, setGauge } satisfies WorkerMetrics,
  };
}

describe('worker observability and drain behavior', () => {
  it('propagates message identifiers and records duration and backlog gauges', async () => {
    const claimed = message();
    const claim = vi.fn(async () => [claimed]);
    const getQueueMetrics = vi.fn(async () => ({
      queueDepth: 4,
      oldestMessageAgeMs: 12_500,
    }));
    const dispatch = vi.fn(async () => {
      expect(getCorrelationContext()).toEqual({
        requestId: 'request-1',
        traceId: '33333333333333333333333333333333',
        userId: 'user-1',
        actorId: 'actor-1',
        eventId: claimed.id,
        jobId: claimed.id,
        correlationId: 'correlation-1',
      });
      return 'acknowledged' as const;
    });
    const clock = [100, 175];
    const { logger: workerLogger } = logger();
    const { metrics: workerMetrics, observe, setGauge } = metrics();

    await expect(
      pollWorkerOnce({
        batchSize: 1,
        delivery: {
          claim,
          getQueueMetrics,
        } as unknown as PostgresOutboxDelivery,
        dispatch,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        metrics: workerMetrics,
        performanceNow: () => clock.shift() ?? 175,
        workerId: 'worker-1',
      }),
    ).resolves.toBe(1);

    expect(observe).toHaveBeenCalledWith(
      workerMetricNames.processingDuration,
      75,
    );
    expect(setGauge).toHaveBeenCalledWith(workerMetricNames.queueDepth, 4);
    expect(setGauge).toHaveBeenCalledWith(
      workerMetricNames.oldestMessageAge,
      12_500,
    );
  });

  it('counts retries and terminal failures only after persistence succeeds', async () => {
    const retry = message(undefined, { attemptCount: 2 });
    const failed = message('55555555-5555-4555-8555-555555555555');
    const claim = vi.fn(async () => [retry, failed]);
    const reschedule = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    const getQueueMetrics = vi.fn(async () => ({
      queueDepth: 1,
      oldestMessageAgeMs: 500,
    }));
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new RetryableJobError('dependency_timeout'))
      .mockRejectedValueOnce(new PermanentJobError('business_rule_rejected'));
    const { logger: workerLogger } = logger();
    const { metrics: workerMetrics, increment } = metrics();

    await pollWorkerOnce({
      batchSize: 2,
      delivery: {
        claim,
        reschedule,
        fail,
        getQueueMetrics,
      } as unknown as PostgresOutboxDelivery,
      dispatch,
      leaseDurationMs: 30_000,
      logger: workerLogger,
      metrics: workerMetrics,
      now: () => new Date('2026-08-02T12:00:00.000Z'),
      random: () => 0,
      workerId: 'worker-1',
    });

    expect(increment).toHaveBeenCalledWith(workerMetricNames.retries);
    expect(increment).toHaveBeenCalledWith(workerMetricNames.failures);
  });

  it('does not claim after graceful shutdown begins and drains current work', async () => {
    const claimed = message();
    const claim = vi.fn(async () => [claimed]);
    let complete: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const dispatch = vi.fn(
      () =>
        new Promise<'acknowledged'>((resolve) => {
          markStarted?.();
          complete = () => resolve('acknowledged');
        }),
    );
    const stop = new AbortController();
    const { logger: workerLogger } = logger();

    const loop = runWorkerLoop({
      batchSize: 1,
      delivery: { claim } as unknown as PostgresOutboxDelivery,
      dispatch,
      leaseDurationMs: 30_000,
      logger: workerLogger,
      pollIntervalMs: 1,
      signal: stop.signal,
      workerId: 'worker-1',
    });

    await started;
    stop.abort(new Error('shutdown requested'));
    complete?.();
    await expect(loop).resolves.toBeUndefined();

    expect(claim).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('abandons a current claim without retry or failure after the drain deadline', async () => {
    const claimed = message();
    const claim = vi.fn(async () => [claimed]);
    const reschedule = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const dispatch = vi.fn(
      (
        _message: ClaimedOutboxMessage,
        options: DispatchOutboxMessageOptions,
      ) =>
        new Promise<'acknowledged'>((_resolve, reject) => {
          markStarted?.();
          const signal = options.signal;
          if (!signal) {
            reject(new Error('Expected a processing abort signal.'));
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const force = new AbortController();
    const { info, logger: workerLogger } = logger();

    const polling = pollWorkerOnce({
      batchSize: 1,
      delivery: {
        claim,
        reschedule,
        fail,
      } as unknown as PostgresOutboxDelivery,
      dispatch,
      forceSignal: force.signal,
      leaseDurationMs: 30_000,
      logger: workerLogger,
      workerId: 'worker-1',
    });

    await started;
    force.abort(new Error('drain deadline exceeded'));
    await expect(polling).resolves.toBe(1);

    expect(reschedule).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      'worker.message.abandoned',
      expect.objectContaining({ reason: 'drain-timeout' }),
    );
  });

  it('returns without claiming when the stop signal is already aborted', async () => {
    const stop = new AbortController();
    stop.abort();
    const claim = vi.fn(async () => []);
    const { logger: workerLogger } = logger();

    await expect(
      pollWorkerOnce({
        batchSize: 1,
        delivery: { claim } as unknown as PostgresOutboxDelivery,
        leaseDurationMs: 30_000,
        logger: workerLogger,
        stopSignal: stop.signal,
        workerId: 'worker-1',
      }),
    ).resolves.toBe(0);

    expect(claim).not.toHaveBeenCalled();
  });
});
