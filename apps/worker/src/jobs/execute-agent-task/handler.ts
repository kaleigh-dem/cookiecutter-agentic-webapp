import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@agentic-webapp/observability';
import { runWithRemoteTrace } from '@agentic-webapp/observability/telemetry';

import {
  agentTaskExecutionRequestedSchema,
  type ExecuteAgentTaskJobContext,
  type ExecuteAgentTaskJobEnvelope,
  type ExecuteAgentTaskJobPayload,
  type ExecuteAgentTaskJobResult,
} from './contract';

type ExecuteAgentTask = (
  payload: ExecuteAgentTaskJobPayload,
  context: ExecuteAgentTaskJobContext,
) => Promise<ExecuteAgentTaskJobResult>;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Agent Task execution was aborted.');
}

const completeAgentTask: ExecuteAgentTask = async (payload, context) => {
  throwIfAborted(context.signal);
  return {
    taskId: payload.taskId,
    correlationId: payload.correlationId,
    completedAt: new Date().toISOString(),
  };
};

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
      runWithCorrelationContext(correlationContext, () => {
        throwIfAborted(envelope.signal);
        return execute(validated, {
          ...(envelope.signal ? { signal: envelope.signal } : {}),
        });
      }),
  );
}
