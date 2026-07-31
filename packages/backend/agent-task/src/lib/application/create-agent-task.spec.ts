import { describe, expect, it, vi } from 'vitest';

import { CreateAgentTask } from './create-agent-task';

describe('CreateAgentTask', () => {
  it('validates, persists, and schedules a correlated execution request', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const useCase = new CreateAgentTask(
      { create, findById: vi.fn() },
      {
        createId: vi
          .fn()
          .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
          .mockReturnValueOnce('22222222-2222-4222-8222-222222222222'),
        now: () => new Date('2026-07-31T17:00:00.000Z'),
      },
    );

    const result = await useCase.execute({
      actorId: '33333333-3333-4333-8333-333333333333',
      title: '  Summarize customer feedback  ',
      prompt: '  Group the feedback into themes.  ',
    });

    expect(result).toMatchObject({
      title: 'Summarize customer feedback',
      prompt: 'Group the feedback into themes.',
      status: 'queued',
      correlationId: '22222222-2222-4222-8222-222222222222',
    });
    expect(create).toHaveBeenCalledWith(
      result,
      expect.objectContaining({
        taskId: result.id,
        correlationId: result.correlationId,
        version: 1,
      }),
    );
  });

  it('rejects blank prompts before persistence', async () => {
    const create = vi.fn();
    const useCase = new CreateAgentTask(
      { create, findById: vi.fn() },
      { createId: () => 'id', now: () => new Date() },
    );

    await expect(
      useCase.execute({ actorId: 'actor', title: 'Title', prompt: '   ' }),
    ).rejects.toThrow('prompt is required');
    expect(create).not.toHaveBeenCalled();
  });
});
