import { describe, expect, it } from 'vitest';

import { handleExecuteAgentTaskJob } from './handler';

describe('handleExecuteAgentTaskJob', () => {
  it('preserves the browser-to-worker correlation identifier', async () => {
    const result = await handleExecuteAgentTaskJob({
      version: 1,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      prompt: 'Prompt',
      correlationId: 'trace-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    });
    expect(result).toMatchObject({
      taskId: '11111111-1111-4111-8111-111111111111',
      correlationId: 'trace-1',
    });
  });
});
