import {
  agentTaskExecutionRequestedSchema,
  type ExecuteAgentTaskJobPayload,
  type ExecuteAgentTaskJobResult,
} from './contract';

export async function handleExecuteAgentTaskJob(
  payload: ExecuteAgentTaskJobPayload,
): Promise<ExecuteAgentTaskJobResult> {
  const validated = agentTaskExecutionRequestedSchema.parse(payload);
  return {
    taskId: validated.taskId,
    correlationId: validated.correlationId,
    completedAt: new Date().toISOString(),
  };
}
