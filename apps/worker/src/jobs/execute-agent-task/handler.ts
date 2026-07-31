import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';

import {
  agentTaskExecutionRequestedSchema,
  type ExecuteAgentTaskJobPayload,
  type ExecuteAgentTaskJobResult,
} from './contract';

type ExecuteAgentTask = (
  payload: ExecuteAgentTaskJobPayload,
) => Promise<ExecuteAgentTaskJobResult>;

const completeAgentTask: ExecuteAgentTask = async (payload) => ({
  taskId: payload.taskId,
  correlationId: payload.correlationId,
  completedAt: new Date().toISOString(),
});

export async function handleExecuteAgentTaskJob(
  payload: ExecuteAgentTaskJobPayload,
  execute: ExecuteAgentTask = completeAgentTask,
): Promise<ExecuteAgentTaskJobResult> {
  const validated = agentTaskExecutionRequestedSchema.parse(payload);
  const context = createCorrelationContext({
    requestId: validated.requestId,
    traceId: validated.traceId,
    userId: validated.userId,
    jobId: validated.jobId,
    correlationId: validated.correlationId,
  });

  return runWithCorrelationContext(context, () => execute(validated));
}
