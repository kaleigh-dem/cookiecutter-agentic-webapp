import { getCorrelationContext } from '@agentic-webapp/observability';
import { describe, expect, it } from 'vitest';

import { handleExecuteAgentTaskJob } from './handler';

describe('handleExecuteAgentTaskJob', () => {
  it('restores exact v2 API and outbox correlation context', async () => {
    const payload = {
      version: 2 as const,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Prompt',
      requestId: 'request-1',
      traceId: 'trace-1',
      traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      jobId: '22222222-2222-4222-8222-222222222222',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    };
    const controller = new AbortController();

    const result = await handleExecuteAgentTaskJob(
      payload,
      async (validated, context) => {
        expect(validated).toEqual(payload);
        expect(context).toEqual({
          jobId: payload.jobId,
          attemptCount: 3,
          signal: controller.signal,
        });
        expect(getCorrelationContext()).toEqual({
          requestId: 'request-1',
          traceId: 'trace-1',
          userId: 'actor-1',
          jobId: '22222222-2222-4222-8222-222222222222',
          correlationId: 'correlation-1',
        });
        return {
          taskId: validated.taskId,
          correlationId: validated.correlationId,
          completedAt: '2026-07-31T17:01:00.000Z',
        };
      },
      { attemptCount: 3, signal: controller.signal },
    );

    expect(result).toEqual({
      taskId: '11111111-1111-4111-8111-111111111111',
      correlationId: 'correlation-1',
      completedAt: '2026-07-31T17:01:00.000Z',
    });
  });

  it('keeps legacy v1 events processable during rollout', async () => {
    const payload = {
      version: 1 as const,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      prompt: 'Prompt',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    };

    await handleExecuteAgentTaskJob(
      payload,
      async (validated, context) => {
        expect(validated).toEqual(payload);
        expect(context).toMatchObject({
          jobId: '33333333-3333-4333-8333-333333333333',
          attemptCount: 2,
        });
        expect(getCorrelationContext()).toEqual(
          expect.objectContaining({
            userId: 'actor-1',
            jobId: '33333333-3333-4333-8333-333333333333',
            correlationId: 'correlation-1',
            requestId: expect.any(String),
            traceId: expect.any(String),
          }),
        );
        return {
          taskId: validated.taskId,
          correlationId: validated.correlationId,
          completedAt: '2026-07-31T17:01:00.000Z',
        };
      },
      {
        jobId: '33333333-3333-4333-8333-333333333333',
        attemptCount: 2,
      },
    );
  });
});
