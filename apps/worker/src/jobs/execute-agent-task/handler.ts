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

export type ExecuteAgentTask = (
  payload: ExecuteAgentTaskJobPayload,
  context: ExecuteAgentTaskJobContext,
) => Promise<ExecuteAgentTaskJobResult>;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Agent Task execution was aborted.');
}

export const completeAgentTask: ExecuteAgentTask = async (payload, context) => {
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
  if (!jobId) {
    throw new Error(
      'Agent Task execution requires a persisted job identifier.',
    );
  }
  const attemptCount = envelope.attemptCount ?? 1;
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
          jobId,
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
        'messaging.message.id': jobId,
        'messaging.message.receive_count': attemptCount,
      },
    },
    () =>
      runWithCorrelationContext(correlationContext, () => {
        throwIfAborted(envelope.signal);
        return execute(validated, {
          jobId,
          attemptCount,
          ...(envelope.signal ? { signal: envelope.signal } : {}),
        });
      }),
  );
}
