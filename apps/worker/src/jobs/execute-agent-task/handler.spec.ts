import { getCorrelationContext } from '@agentic-webapp/observability';
import { describe, expect, it } from 'vitest';

import { handleExecuteAgentTaskJob } from './handler';

describe('handleExecuteAgentTaskJob', () => {
  it('restores API and outbox correlation context around execution', async () => {
    const payload = {
      version: 1 as const,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Prompt',
      requestId: 'request-1',
      traceId: 'trace-1',
      jobId: '22222222-2222-4222-8222-222222222222',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    };

    const result = await handleExecuteAgentTaskJob(
      payload,
      async (validated) => {
        expect(validated).toEqual(payload);
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
    );

    expect(result).toEqual({
      taskId: '11111111-1111-4111-8111-111111111111',
      correlationId: 'correlation-1',
      completedAt: '2026-07-31T17:01:00.000Z',
    });
  });
});
