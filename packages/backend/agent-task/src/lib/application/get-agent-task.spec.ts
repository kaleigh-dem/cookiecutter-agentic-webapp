import { describe, expect, it, vi } from 'vitest';

import { GetAgentTask } from './get-agent-task';

const task = {
  id: 'task-id',
  ownerId: 'owner-id',
  title: 'Task',
  prompt: 'Prompt',
  status: 'queued' as const,
  correlationId: 'correlation-id',
  createdAt: new Date('2026-07-31T17:00:00.000Z'),
};

describe('GetAgentTask', () => {
  it('returns an owned task', async () => {
    const useCase = new GetAgentTask({
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(task),
    });
    await expect(useCase.execute(task.id, task.ownerId)).resolves.toEqual(task);
  });

  it('rejects access by another actor', async () => {
    const useCase = new GetAgentTask({
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(task),
    });
    await expect(useCase.execute(task.id, 'other-actor')).rejects.toThrow(
      'cannot access',
    );
  });
});
