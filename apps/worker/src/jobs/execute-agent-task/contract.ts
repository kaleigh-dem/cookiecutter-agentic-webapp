import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';

export {
  agentTaskExecutionRequestedSchema,
  agentTaskExecutionRequestedV1Schema,
  agentTaskExecutionRequestedV2Schema,
} from '@agentic-webapp/contracts';
export type ExecuteAgentTaskJobPayload = AgentTaskExecutionRequested;

export const executeAgentTaskQueue = 'agent-tasks' as const;

export interface ExecuteAgentTaskJobEnvelope {
  readonly jobId?: string;
  readonly signal?: AbortSignal;
}

export interface ExecuteAgentTaskJobContext {
  readonly signal?: AbortSignal;
}

export interface ExecuteAgentTaskJobResult {
  readonly taskId: string;
  readonly correlationId: string;
  readonly completedAt: string;
}
