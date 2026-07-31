import { describe, expect, it } from 'vitest';

import { agentTaskExecutionRequestedSchema } from './schema';

describe('agentTaskExecutionRequestedSchema', () => {
  it('preserves versioned task and operational identifiers', () => {
    const result = agentTaskExecutionRequestedSchema.parse({
      version: 1,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Summarize the document.',
      requestId: 'request-1',
      traceId: 'trace-1',
      jobId: '22222222-2222-4222-8222-222222222222',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    });

    expect(result).toMatchObject({
      version: 1,
      requestId: 'request-1',
      traceId: 'trace-1',
      jobId: '22222222-2222-4222-8222-222222222222',
      correlationId: 'correlation-1',
    });
  });
});
