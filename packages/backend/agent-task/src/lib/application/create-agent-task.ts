import { randomUUID } from 'node:crypto';

import {
  agentTaskExecutionRequestedV2Schema,
  type AgentTaskExecutionRequestedV2,
} from '@steadystack/contracts';

import { createAgentTask, type AgentTask } from '../domain/agent-task';
import type { AgentTaskRepository } from './agent-task-repository';

export interface CreateAgentTaskCommand {
  readonly actorId: string;
  readonly title: string;
  readonly prompt: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly traceParent?: string;
  readonly userId?: string;
}

export interface AgentTaskDependencies {
  readonly createId: () => string;
  readonly createJobId?: () => string;
  readonly now: () => Date;
}

const defaultDependencies: AgentTaskDependencies = {
  createId: randomUUID,
  createJobId: randomUUID,
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
    const executionRequested: AgentTaskExecutionRequestedV2 =
      agentTaskExecutionRequestedV2Schema.parse({
        version: 2,
        taskId: task.id,
        actorId: task.ownerId,
        userId: command.userId ?? task.ownerId,
        prompt: task.prompt,
        requestId: command.requestId ?? randomUUID(),
        traceId: command.traceId ?? randomUUID().replaceAll('-', ''),
        ...(command.traceParent ? { traceParent: command.traceParent } : {}),
        jobId: this.dependencies.createJobId?.() ?? randomUUID(),
        correlationId: task.correlationId,
        occurredAt: task.createdAt.toISOString(),
      });

    await this.repository.create(task, executionRequested);
    return task;
  }
}
