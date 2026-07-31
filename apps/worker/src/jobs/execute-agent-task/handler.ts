import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';

import {
  agentTaskExecutionRequestedSchema,
  type ExecuteAgentTaskJobEnvelope,
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
  envelope: ExecuteAgentTaskJobEnvelope = {},
): Promise<ExecuteAgentTaskJobResult> {
  const validated = agentTaskExecutionRequestedSchema.parse(payload);
  const context =
    validated.version === 2
      ? createCorrelationContext({
          requestId: validated.requestId,
          traceId: validated.traceId,
          userId: validated.userId,
          jobId: validated.jobId,
          correlationId: validated.correlationId,
        })
      : createCorrelationContext({
          userId: validated.actorId,
          correlationId: validated.correlationId,
          ...(envelope.jobId ? { jobId: envelope.jobId } : {}),
        });

  return runWithCorrelationContext(context, () => execute(validated));
}
