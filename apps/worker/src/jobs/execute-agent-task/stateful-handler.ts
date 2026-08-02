import type {
  AgentTaskExecutionRecord,
  AgentTaskExecutionStore,
} from '@agentic-webapp/database';

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

export class AgentTaskExecutionStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AgentTaskExecutionStateError';
  }
}

function terminalResult(
  payload: ExecuteAgentTaskJobPayload,
  record: AgentTaskExecutionRecord,
): ExecuteAgentTaskJobResult {
  const finishedAt =
    record.succeededAt ?? record.failedAt ?? record.startedAt ?? new Date(0);
  return {
    taskId: payload.taskId,
    correlationId: payload.correlationId,
    completedAt: finishedAt.toISOString(),
  };
}

function executionErrorCode(error: unknown): string {
  if (!(error instanceof Error) || error.name === 'Error') {
    return 'execution_failed';
  }
  return error.name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .toLowerCase()
    .slice(0, 120);
}

function executionErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown Agent Task execution error.';
  return message.slice(0, 1000);
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
      if (!context.signal?.aborted) {
        await store.fail({
          taskId: payload.taskId,
          jobId: context.jobId,
          deliveryAttempt: context.attemptCount,
          finishedAt: now(),
          errorCode: executionErrorCode(error),
          errorMessage: executionErrorMessage(error),
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
