import type { AgentTaskExecutionRequestedV2 } from '@agentic-webapp/contracts';

import type { AgentTask } from '../domain/agent-task';

export const AGENT_TASK_REPOSITORY = Symbol('AGENT_TASK_REPOSITORY');

export interface AgentTaskRepository {
  create(
    task: AgentTask,
    executionRequested: AgentTaskExecutionRequestedV2,
  ): Promise<void>;
  findById(id: string): Promise<AgentTask | null>;
}
