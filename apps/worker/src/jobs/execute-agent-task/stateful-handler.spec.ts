import type {
  AgentTaskExecutionRecord,
  AgentTaskExecutionStore,
} from '@agentic-webapp/database';
import { describe, expect, it, vi } from 'vitest';

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

      await expect(handler(payload, undefined, envelope)).resolves.toMatchObject({
        taskId: payload.taskId,
        completedAt: terminalAt.toISOString(),
      });
      expect(execute).not.toHaveBeenCalled();
      expect(execution.succeed).not.toHaveBeenCalled();
      expect(execution.fail).not.toHaveBeenCalled();
    },
  );

  it('persists safe failure metadata and rethrows execution errors', async () => {
    const execution = store();
    const execute = vi.fn(async () => {
      throw new TypeError('downstream request failed');
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
      'downstream request failed',
    );
    expect(execution.fail).toHaveBeenCalledWith({
      taskId: payload.taskId,
      jobId: payload.jobId,
      deliveryAttempt: 1,
      finishedAt: new Date('2026-08-02T15:02:00.000Z'),
      errorCode: 'type_error',
      errorMessage: 'downstream request failed',
    });
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
