import { randomUUID } from 'node:crypto';

import {
  agentTaskExecutionRequestedSchema,
  type AgentTaskExecutionRequested,
} from '@agentic-webapp/contracts';

import { createAgentTask, type AgentTask } from '../domain/agent-task';
import type { AgentTaskRepository } from './agent-task-repository';

export interface CreateAgentTaskCommand {
  readonly actorId: string;
  readonly title: string;
  readonly prompt: string;
  readonly correlationId?: string;
}

export interface AgentTaskDependencies {
  readonly createId: () => string;
  readonly now: () => Date;
}

const defaultDependencies: AgentTaskDependencies = {
  createId: randomUUID,
  now: () => new Date(),
};

export class CreateAgentTask {
  public constructor(
    private readonly repository: AgentTaskRepository,
    private readonly dependencies: AgentTaskDependencies = defaultDependencies,
  ) {}

  public async execute(command: CreateAgentTaskCommand): Promise<AgentTask> {
    const createdAt = this.dependencies.now();
    const task = createAgentTask({
      id: this.dependencies.createId(),
      ownerId: command.actorId,
      title: command.title,
      prompt: command.prompt,
      correlationId: command.correlationId ?? this.dependencies.createId(),
      createdAt,
    });
    const executionRequested: AgentTaskExecutionRequested =
      agentTaskExecutionRequestedSchema.parse({
        version: 1,
        taskId: task.id,
        actorId: task.ownerId,
        prompt: task.prompt,
        correlationId: task.correlationId,
        occurredAt: task.createdAt.toISOString(),
      });

    await this.repository.create(task, executionRequested);
    return task;
  }
}
