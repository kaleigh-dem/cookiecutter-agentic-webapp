import type {
  AgentTaskExecutionRecord,
  AgentTaskExecutionStore,
} from '@steadystack/database';

import { classifyJobFailure, PermanentJobError } from '../failure';
import type {
  ExecuteAgentTaskJobEnvelope,
  ExecuteAgentTaskJobPayload,
  ExecuteAgentTaskJobResult,
} from './contract';
import {
  completeAgentTask,
  handleExecuteAgentTaskJob,
  type ExecuteAgentTask,
} from './handler';

export interface StatefulExecuteAgentTaskOptions {
  readonly execute?: ExecuteAgentTask;
  readonly now?: () => Date;
}

export type StatefulExecuteAgentTaskHandler = (
  payload: ExecuteAgentTaskJobPayload,
  execute?: undefined,
  envelope?: ExecuteAgentTaskJobEnvelope,
) => Promise<ExecuteAgentTaskJobResult>;

export class AgentTaskExecutionStateError extends PermanentJobError {
  public constructor(message: string) {
    super('execution_state_conflict', message);
    this.name = 'AgentTaskExecutionStateError';
  }
}

function terminalResult(
  payload: ExecuteAgentTaskJobPayload,
  record: AgentTaskExecutionRecord,
): ExecuteAgentTaskJobResult {
  const finishedAt =
    record.status === 'succeeded'
      ? record.succeededAt
      : record.status === 'failed'
        ? record.failedAt
        : null;
  if (!finishedAt) {
    throw new AgentTaskExecutionStateError(
      `Terminal Agent Task ${payload.taskId} is missing its completion timestamp.`,
    );
  }
  return {
    taskId: payload.taskId,
    correlationId: payload.correlationId,
    completedAt: finishedAt.toISOString(),
  };
}

function stateError(
  operation: string,
  payload: ExecuteAgentTaskJobPayload,
  outcome: string,
): AgentTaskExecutionStateError {
  return new AgentTaskExecutionStateError(
    `Cannot ${operation} Agent Task ${payload.taskId}: ${outcome}.`,
  );
}

export function createStatefulExecuteAgentTaskHandler(
  store: AgentTaskExecutionStore,
  options: StatefulExecuteAgentTaskOptions = {},
): StatefulExecuteAgentTaskHandler {
  const execute = options.execute ?? completeAgentTask;
  const now = options.now ?? (() => new Date());

  const statefulExecute: ExecuteAgentTask = async (payload, context) => {
    const begin = await store.begin({
      taskId: payload.taskId,
      jobId: context.jobId,
      deliveryAttempt: context.attemptCount,
      startedAt: now(),
    });

    if (
      begin.outcome === 'already-succeeded' ||
      begin.outcome === 'already-failed'
    ) {
      return terminalResult(payload, begin.record);
    }
    if (begin.outcome !== 'started') {
      throw stateError('start', payload, begin.outcome);
    }

    let result: ExecuteAgentTaskJobResult;
    try {
      result = await execute(payload, context);
    } catch (error) {
      const failure = classifyJobFailure(error);
      const exhausted = context.attemptCount >= context.maxAttempts;
      if (
        !context.signal?.aborted &&
        (failure.disposition === 'permanent' || exhausted)
      ) {
        await store.fail({
          taskId: payload.taskId,
          jobId: context.jobId,
          deliveryAttempt: context.attemptCount,
          finishedAt: now(),
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
        });
      }
      throw error;
    }

    if (context.signal?.aborted) {
      throw context.signal.reason instanceof Error
        ? context.signal.reason
        : new Error('Agent Task execution was aborted before completion.');
    }

    const succeeded = await store.succeed({
      taskId: payload.taskId,
      jobId: context.jobId,
      deliveryAttempt: context.attemptCount,
      finishedAt: now(),
    });
    if (
      succeeded.outcome !== 'transitioned' &&
      succeeded.outcome !== 'duplicate'
    ) {
      throw stateError('complete', payload, succeeded.outcome);
    }

    return {
      ...result,
      completedAt:
        succeeded.record.succeededAt?.toISOString() ?? result.completedAt,
    };
  };

  return (payload, _execute, envelope) =>
    handleExecuteAgentTaskJob(payload, statefulExecute, envelope);
}
