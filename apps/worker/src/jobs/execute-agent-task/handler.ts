import {
  createCorrelationContext,
  runWithCorrelationContext,
} from '@steadystack/observability';
import { runWithRemoteTrace } from '@steadystack/observability/telemetry';

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
  const payloadJobId = validated.version === 2 ? validated.jobId : undefined;
  const jobId = envelope.jobId ?? payloadJobId;
  if (!jobId) {
    throw new Error(
      'Agent Task execution requires a persisted job identifier.',
    );
  }
  if (payloadJobId && envelope.jobId && payloadJobId !== envelope.jobId) {
    throw new Error(
      'Agent Task execution payload jobId does not match the persisted job identifier.',
    );
  }
  const attemptCount = envelope.attemptCount ?? 1;
  const maxAttempts = envelope.maxAttempts ?? 1;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Agent Task execution maxAttempts must be positive.');
  }
  const correlationContext =
    validated.version === 2
      ? createCorrelationContext({
          requestId: validated.requestId,
          traceId: validated.traceId,
          userId: validated.userId,
          actorId: validated.actorId,
          eventId: jobId,
          jobId,
          correlationId: validated.correlationId,
        })
      : createCorrelationContext({
          userId: validated.actorId,
          actorId: validated.actorId,
          eventId: jobId,
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
        'app.actor.id': validated.actorId,
        'app.correlation.id': validated.correlationId,
        'app.event.id': jobId,
        'app.request.id': correlationContext.requestId,
        'app.trace.id': correlationContext.traceId,
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
          maxAttempts,
          ...(envelope.signal ? { signal: envelope.signal } : {}),
        });
      }),
  );
}
