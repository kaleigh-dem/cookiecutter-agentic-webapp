import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';

export { agentTaskExecutionRequestedSchema } from '@agentic-webapp/contracts';
export type ExecuteAgentTaskJobPayload = AgentTaskExecutionRequested;

export const executeAgentTaskQueue = 'agent-tasks' as const;

export interface ExecuteAgentTaskJobResult {
  readonly taskId: string;
  readonly correlationId: string;
  readonly completedAt: string;
}
