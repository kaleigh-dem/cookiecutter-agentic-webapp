import {
  CreateAgentTask,
  GetAgentTask,
} from '@agentic-webapp/backend-agent-task';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AgentTasksController } from './agent-tasks.controller';
import type { SecurityAuditService } from '../security/security.module';

function createAuditService() {
  return { record: vi.fn() } as unknown as SecurityAuditService;
}

describe('AgentTasksController', () => {
  it('maps the authenticated principal and correlation header into the use case', async () => {
    const repository = { create: vi.fn(), findById: vi.fn() };
    const create = new CreateAgentTask(repository, {
      createId: () => '11111111-1111-4111-8111-111111111111',
      now: () => new Date('2026-07-31T17:00:00.000Z'),
    });
    const audit = createAuditService();
    const controller = new AgentTasksController(
      create,
      new GetAgentTask(repository),
      audit,
    );

    const result = await controller.create(
      { title: 'Task', prompt: 'Prompt' },
      { subject: 'actor-1', permissions: ['agent-tasks:write'] },
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-task.create',
        actorId: 'actor-1',
        outcome: 'allowed',
      }),
    );
  });

  it('rejects malformed task IDs before querying the repository', async () => {
    const repository = { create: vi.fn(), findById: vi.fn() };
    const controller = new AgentTasksController(
      new CreateAgentTask(repository),
      new GetAgentTask(repository),
      createAuditService(),
    );

    await expect(
      controller.get('not-a-uuid', {
        subject: 'actor-1',
        permissions: ['agent-tasks:read'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
