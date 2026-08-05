import type { AgentTaskExecutionRequested } from '@steadystack/contracts';

export {
  agentTaskExecutionRequestedSchema,
  agentTaskExecutionRequestedV1Schema,
  agentTaskExecutionRequestedV2Schema,
} from '@steadystack/contracts';
export type ExecuteAgentTaskJobPayload = AgentTaskExecutionRequested;

export const executeAgentTaskQueue = 'agent-tasks' as const;

export interface ExecuteAgentTaskJobEnvelope {
  readonly jobId?: string;
  readonly attemptCount?: number;
  readonly maxAttempts?: number;
  readonly signal?: AbortSignal;
}

export interface ExecuteAgentTaskJobContext {
  readonly jobId: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly signal?: AbortSignal;
}

export interface ExecuteAgentTaskJobResult {
  readonly taskId: string;
  readonly correlationId: string;
  readonly completedAt: string;
}
