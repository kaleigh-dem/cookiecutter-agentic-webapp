import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';

import {
  agentTaskExecutionRequestedSchema,
  type ExecuteAgentTaskJobPayload,
  type ExecuteAgentTaskJobResult,
} from './contract';

export async function handleExecuteAgentTaskJob(
  payload: ExecuteAgentTaskJobPayload,
): Promise<ExecuteAgentTaskJobResult> {
  const validated = agentTaskExecutionRequestedSchema.parse(payload);
  const context = createCorrelationContext({
    requestId: validated.requestId,
    traceId: validated.traceId,
    userId: validated.userId,
    jobId: validated.jobId,
    correlationId: validated.correlationId,
  });

  return runWithCorrelationContext(context, async () => ({
    taskId: validated.taskId,
    correlationId: validated.correlationId,
    completedAt: new Date().toISOString(),
  }));
}
