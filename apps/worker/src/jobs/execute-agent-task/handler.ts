import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import { runWithRemoteTrace } from '@agentic-webapp/observability/telemetry';

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
  const jobId = validated.version === 2 ? validated.jobId : envelope.jobId;
  const correlationContext =
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

  return runWithRemoteTrace(
    {
      name: 'agent_task.execute',
      ...(validated.version === 2 && validated.traceParent
        ? { traceParent: validated.traceParent }
        : {}),
      attributes: {
        'agent_task.id': validated.taskId,
        'messaging.operation.name': 'process',
        'messaging.message.type': `agent-task.execute.v${validated.version}`,
        ...(jobId ? { 'messaging.message.id': jobId } : {}),
      },
    },
    () =>
      runWithCorrelationContext(correlationContext, () => execute(validated)),
  );
}
