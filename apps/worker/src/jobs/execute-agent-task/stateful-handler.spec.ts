import type {
  AgentTaskExecutionRecord,
  AgentTaskExecutionStore,
} from '@agentic-webapp/database';
import { describe, expect, it, vi } from 'vitest';

import { PermanentJobError, RetryableJobError } from '../failure';
import type { ExecuteAgentTaskJobPayload } from './contract';
import { createStatefulExecuteAgentTaskHandler } from './stateful-handler';

const payload: ExecuteAgentTaskJobPayload = {
  version: 2,
  taskId: '11111111-1111-4111-8111-111111111111',
  actorId: 'actor-1',
  userId: 'actor-1',
  prompt: 'Execute the task',
  requestId: 'request-1',
  traceId: '33333333333333333333333333333333',
  jobId: '22222222-2222-4222-8222-222222222222',
  correlationId: 'correlation-1',
  occurredAt: '2026-08-02T15:00:00.000Z',
};

function record(
  overrides: Partial<AgentTaskExecutionRecord> = {},
): AgentTaskExecutionRecord {
  return {
    taskId: payload.taskId,
    status: 'running',
    jobId: payload.jobId,
    executionAttemptCount: 1,
    deliveryAttempt: 1,
    startedAt: new Date('2026-08-02T15:01:00.000Z'),
    succeededAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

function store(overrides: Partial<AgentTaskExecutionStore> = {}) {
  const begin = vi.fn(async () => ({
    outcome: 'started' as const,
    record: record(),
  }));
  const succeed = vi.fn(async () => ({
    outcome: 'transitioned' as const,
    record: record({
      status: 'succeeded',
      succeededAt: new Date('2026-08-02T15:02:00.000Z'),
    }),
  }));
  const fail = vi.fn(async () => ({
    outcome: 'transitioned' as const,
    record: record({
      status: 'failed',
      failedAt: new Date('2026-08-02T15:02:00.000Z'),
    }),
  }));
  return {
    begin,
    succeed,
    fail,
    store: { begin, succeed, fail, ...overrides } as AgentTaskExecutionStore,
  };
}

const envelope = {
  jobId: payload.jobId,
  attemptCount: 1,
  maxAttempts: 5,
};

describe('createStatefulExecuteAgentTaskHandler', () => {
  it('persists running and succeeded transitions around execution', async () => {
    const execution = store();
    const execute = vi.fn(async () => ({
      taskId: payload.taskId,
      correlationId: payload.correlationId,
      completedAt: '2026-08-02T15:01:30.000Z',
    }));
    const times = [
      new Date('2026-08-02T15:01:00.000Z'),
      new Date('2026-08-02T15:02:00.000Z'),
    ];
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
      now: () => times.shift() ?? new Date('2026-08-02T15:02:00.000Z'),
    });

    await expect(handler(payload, undefined, envelope)).resolves.toEqual({
      taskId: payload.taskId,
      correlationId: payload.correlationId,
      completedAt: '2026-08-02T15:02:00.000Z',
    });

    expect(execution.begin).toHaveBeenCalledWith({
      taskId: payload.taskId,
      jobId: payload.jobId,
      deliveryAttempt: 1,
      startedAt: new Date('2026-08-02T15:01:00.000Z'),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execution.succeed).toHaveBeenCalledWith({
      taskId: payload.taskId,
      jobId: payload.jobId,
      deliveryAttempt: 1,
      finishedAt: new Date('2026-08-02T15:02:00.000Z'),
    });
    expect(execution.fail).not.toHaveBeenCalled();
  });

  it.each([
    ['already-succeeded', 'succeededAt'],
    ['already-failed', 'failedAt'],
  ] as const)(
    'acknowledges %s duplicate delivery without re-executing',
    async (outcome, terminalField) => {
      const terminalAt = new Date('2026-08-02T15:03:00.000Z');
      const execution = store({
        begin: vi.fn(async () => ({
          outcome,
          record: record({
            status: outcome === 'already-succeeded' ? 'succeeded' : 'failed',
            [terminalField]: terminalAt,
          }),
        })),
      });
      const execute = vi.fn();
      const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
        execute,
      });

      await expect(
        handler(payload, undefined, envelope),
      ).resolves.toMatchObject({
        taskId: payload.taskId,
        completedAt: terminalAt.toISOString(),
      });
      expect(execute).not.toHaveBeenCalled();
      expect(execution.succeed).not.toHaveBeenCalled();
      expect(execution.fail).not.toHaveBeenCalled();
    },
  );

  it('returns a migrated terminal timestamp instead of an epoch fallback', async () => {
    const migratedAt = new Date('2026-07-31T17:00:00.000Z');
    const execution = store({
      begin: vi.fn(async () => ({
        outcome: 'already-succeeded' as const,
        record: record({
          status: 'succeeded',
          startedAt: null,
          succeededAt: migratedAt,
        }),
      })),
    });
    const execute = vi.fn();
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
    });

    await expect(handler(payload, undefined, envelope)).resolves.toEqual({
      taskId: payload.taskId,
      correlationId: payload.correlationId,
      completedAt: migratedAt.toISOString(),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('leaves retryable failures resumable before the attempt limit', async () => {
    const execution = store();
    const execute = vi.fn(async () => {
      throw new RetryableJobError('dependency_unavailable');
    });
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
    });

    await expect(handler(payload, undefined, envelope)).rejects.toThrow(
      'retryable dependency',
    );
    expect(execution.fail).not.toHaveBeenCalled();
    expect(execution.succeed).not.toHaveBeenCalled();
  });

  it('persists a terminal task failure when retry attempts are exhausted', async () => {
    const execution = store();
    const execute = vi.fn(async () => {
      throw new RetryableJobError('dependency_unavailable');
    });
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
      now: (() => {
        const times = [
          new Date('2026-08-02T15:01:00.000Z'),
          new Date('2026-08-02T15:02:00.000Z'),
        ];
        return () => times.shift() ?? new Date('2026-08-02T15:02:00.000Z');
      })(),
    });

    await expect(
      handler(payload, undefined, {
        ...envelope,
        attemptCount: 5,
      }),
    ).rejects.toThrow('retryable dependency');
    expect(execution.fail).toHaveBeenCalledWith({
      taskId: payload.taskId,
      jobId: payload.jobId,
      deliveryAttempt: 5,
      finishedAt: new Date('2026-08-02T15:02:00.000Z'),
      errorCode: 'dependency_unavailable',
      errorMessage: 'Agent Task execution failed temporarily.',
    });
  });

  it('persists safe metadata for permanent failures and rethrows', async () => {
    const execution = store();
    const sensitiveMessage =
      'Authorization: Bearer super-secret-token; prompt=private request';
    const execute = vi.fn(async () => {
      throw new PermanentJobError('business_rule_rejected', sensitiveMessage);
    });
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
      now: (() => {
        const times = [
          new Date('2026-08-02T15:01:00.000Z'),
          new Date('2026-08-02T15:02:00.000Z'),
        ];
        return () => times.shift() ?? new Date('2026-08-02T15:02:00.000Z');
      })(),
    });

    await expect(handler(payload, undefined, envelope)).rejects.toThrow(
      sensitiveMessage,
    );
    expect(execution.fail).toHaveBeenCalledWith({
      taskId: payload.taskId,
      jobId: payload.jobId,
      deliveryAttempt: 1,
      finishedAt: new Date('2026-08-02T15:02:00.000Z'),
      errorCode: 'business_rule_rejected',
      errorMessage: 'Agent Task execution failed permanently.',
    });
    const persistedFailure = execution.fail.mock.calls[0]?.[0];
    expect(JSON.stringify(persistedFailure)).not.toContain(
      'super-secret-token',
    );
    expect(JSON.stringify(persistedFailure)).not.toContain('private request');
    expect(execution.succeed).not.toHaveBeenCalled();
  });

  it('does not mark the task failed after claim-loss cancellation', async () => {
    const execution = store();
    const controller = new AbortController();
    const execute = vi.fn(async () => {
      controller.abort(new Error('claim lost'));
      throw controller.signal.reason;
    });
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
    });

    await expect(
      handler(payload, undefined, { ...envelope, signal: controller.signal }),
    ).rejects.toThrow('claim lost');
    expect(execution.fail).not.toHaveBeenCalled();
    expect(execution.succeed).not.toHaveBeenCalled();
  });

  it('rejects stale or concurrently active delivery attempts', async () => {
    const execution = store({
      begin: vi.fn(async () => ({
        outcome: 'in-progress' as const,
        record: record(),
      })),
    });
    const execute = vi.fn();
    const handler = createStatefulExecuteAgentTaskHandler(execution.store, {
      execute,
    });

    await expect(handler(payload, undefined, envelope)).rejects.toThrow(
      'in-progress',
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
