import { describe, expect, it } from 'vitest';

import { agentTaskExecutionRequestedSchema } from './schema';

describe('agentTaskExecutionRequestedSchema', () => {
  it('preserves the versioned task and correlation identifiers', () => {
    const result = agentTaskExecutionRequestedSchema.parse({
      version: 1,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      prompt: 'Summarize the document.',
      correlationId: 'trace-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    });
    expect(result).toMatchObject({ version: 1, correlationId: 'trace-1' });
  });
});
