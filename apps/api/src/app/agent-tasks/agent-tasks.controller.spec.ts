import {
  CreateAgentTask,
  GetAgentTask,
} from '@agentic-webapp/backend-agent-task';
import { describe, expect, it, vi } from 'vitest';

import { AgentTasksController } from './agent-tasks.controller';

describe('AgentTasksController', () => {
  it('maps the actor and correlation headers into the use case', async () => {
    const repository = { create: vi.fn(), findById: vi.fn() };
    const create = new CreateAgentTask(repository, {
      createId: () => '11111111-1111-4111-8111-111111111111',
      now: () => new Date('2026-07-31T17:00:00.000Z'),
    });
    const controller = new AgentTasksController(
      create,
      new GetAgentTask(repository),
    );

    const result = await controller.create(
      { title: 'Task', prompt: 'Prompt' },
      'actor-1',
      'trace-1',
    );

    expect(result).toMatchObject({
      correlationId: 'trace-1',
      status: 'queued',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'actor-1' }),
      expect.objectContaining({ correlationId: 'trace-1' }),
    );
  });
});
