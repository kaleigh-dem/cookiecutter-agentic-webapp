import type { ClaimedOutboxMessage } from '@agentic-webapp/database';
import { describe, expect, it, vi } from 'vitest';

import type {
  ExecuteAgentTaskJobEnvelope,
  ExecuteAgentTaskJobPayload,
} from '../jobs/execute-agent-task/contract';
import {
  dispatchOutboxMessage,
  type ExecuteAgentTaskHandler,
  type OutboxDisposition,
} from './dispatch';

function message(
  overrides: Partial<ClaimedOutboxMessage> = {},
): ClaimedOutboxMessage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'agent-task.execute.v2',
    payload: {
      version: 2,
      taskId: '22222222-2222-4222-8222-222222222222',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Execute the task',
      requestId: 'request-1',
      traceId: '33333333333333333333333333333333',
      jobId: '11111111-1111-4111-8111-111111111111',
      correlationId: 'correlation-1',
      occurredAt: '2026-08-02T12:00:00.000Z',
    },
    correlationId: 'correlation-1',
    attemptCount: 1,
    nextAttemptAt: new Date('2026-08-02T12:00:00.000Z'),
    workerId: 'worker-1',
    claimToken: '44444444-4444-4444-8444-444444444444',
    claimExpiresAt: new Date('2026-08-02T12:01:00.000Z'),
    createdAt: new Date('2026-08-02T11:59:00.000Z'),
    ...overrides,
  };
}

function disposition() {
  const acknowledge = vi.fn(async () => true);
  const fail = vi.fn(async () => true);
  return {
    acknowledge,
    fail,
    delivery: { acknowledge, fail } satisfies OutboxDisposition,
  };
}

describe('dispatchOutboxMessage', () => {
  it('routes a supported event and acknowledges the active claim', async () => {
    const { acknowledge, delivery, fail } = disposition();
    const handle = vi.fn(async () => ({ accepted: true }));
    const claimed = message();

    await expect(
      dispatchOutboxMessage(claimed, {
        delivery,
        handleExecuteAgentTask: handle as ExecuteAgentTaskHandler,
      }),
    ).resolves.toBe('acknowledged');

    expect(handle).toHaveBeenCalledWith(claimed.payload, undefined, {
      jobId: claimed.id,
    });
    expect(acknowledge).toHaveBeenCalledWith({
      id: claimed.id,
      workerId: claimed.workerId,
      claimToken: claimed.claimToken,
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it('abandons the handler and never acknowledges after claim loss', async () => {
    const { acknowledge, delivery, fail } = disposition();
    const controller = new AbortController();
    let completeHandler: (() => void) | undefined;
    const handle = vi.fn(
      (
        _payload: ExecuteAgentTaskJobPayload,
        _execute: undefined,
        envelope?: ExecuteAgentTaskJobEnvelope,
      ) =>
        new Promise((resolve) => {
          expect(envelope?.signal).toBe(controller.signal);
          completeHandler = () => resolve({ accepted: true });
        }),
    );
    const dispatching = dispatchOutboxMessage(message(), {
      delivery,
      handleExecuteAgentTask: handle as ExecuteAgentTaskHandler,
      signal: controller.signal,
    });

    controller.abort(new Error('lease safety deadline exceeded'));

    await expect(dispatching).rejects.toThrow('lease safety deadline exceeded');
    expect(acknowledge).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();

    completeHandler?.();
    await Promise.resolve();
  });

  it('quarantines unknown event types', async () => {
    const { acknowledge, delivery, fail } = disposition();
    const claimed = message({ kind: 'unknown.event.v1' });

    await expect(dispatchOutboxMessage(claimed, { delivery })).resolves.toBe(
      'quarantined',
    );

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({
        id: claimed.id,
        errorCode: 'unsupported_event_type',
      }),
    );
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('quarantines unsupported versions in a known event family', async () => {
    const { delivery, fail } = disposition();
    const claimed = message({ kind: 'agent-task.execute.v3' });

    await dispatchOutboxMessage(claimed, { delivery });

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'unsupported_event_version' }),
    );
  });

  it('quarantines payloads that fail their versioned contract', async () => {
    const { delivery, fail } = disposition();
    const claimed = message({ payload: { version: 2 } as never });

    await dispatchOutboxMessage(claimed, { delivery });

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'invalid_contract' }),
    );
  });

  it('leaves the lease active when the handler fails unexpectedly', async () => {
    const { acknowledge, delivery, fail } = disposition();
    const handle = vi.fn(async () => {
      throw new Error('dependency unavailable');
    });

    await expect(
      dispatchOutboxMessage(message(), {
        delivery,
        handleExecuteAgentTask: handle as ExecuteAgentTaskHandler,
      }),
    ).rejects.toThrow('dependency unavailable');

    expect(acknowledge).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});
