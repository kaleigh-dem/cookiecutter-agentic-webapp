import type { AgentTask } from '../domain/agent-task';
import type { AgentTaskRepository } from './agent-task-repository';

export class AgentTaskNotFoundError extends Error {
  public constructor(id: string) {
    super(`Agent task ${id} was not found.`);
    this.name = 'AgentTaskNotFoundError';
  }
}

export class AgentTaskForbiddenError extends Error {
  public constructor() {
    super('The actor cannot access this agent task.');
    this.name = 'AgentTaskForbiddenError';
  }
}

export class GetAgentTask {
  public constructor(private readonly repository: AgentTaskRepository) {}

  public async execute(id: string, actorId: string): Promise<AgentTask> {
    const task = await this.repository.findById(id);
    if (!task) {
      throw new AgentTaskNotFoundError(id);
    }
    if (task.ownerId !== actorId) {
      throw new AgentTaskForbiddenError();
    }
    return task;
  }
}
