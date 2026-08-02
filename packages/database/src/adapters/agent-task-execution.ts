import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { Database } from '../client';
import {
  agentTasks,
  type AgentTaskRow,
  type AgentTaskRowStatus,
} from '../schema';

export interface AgentTaskExecutionRecord {
  readonly taskId: string;
  readonly status: AgentTaskRowStatus;
  readonly jobId: string | null;
  readonly executionAttemptCount: number;
  readonly deliveryAttempt: number | null;
  readonly startedAt: Date | null;
  readonly succeededAt: Date | null;
  readonly failedAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
}

export interface BeginAgentTaskExecutionInput {
  readonly taskId: string;
  readonly jobId: string;
  readonly deliveryAttempt: number;
  readonly startedAt: Date;
}

export interface FinishAgentTaskExecutionInput {
  readonly taskId: string;
  readonly jobId: string;
  readonly deliveryAttempt: number;
  readonly finishedAt: Date;
}

export interface FailAgentTaskExecutionInput
  extends FinishAgentTaskExecutionInput {
  readonly errorCode: string;
  readonly errorMessage: string;
}

export type BeginAgentTaskExecutionResult =
  | {
      readonly outcome: 'started';
      readonly record: AgentTaskExecutionRecord;
    }
  | {
      readonly outcome:
        | 'already-succeeded'
        | 'already-failed'
        | 'in-progress'
        | 'missing'
        | 'conflict';
      readonly record?: AgentTaskExecutionRecord;
    };

export type FinishAgentTaskExecutionResult =
  | {
      readonly outcome: 'transitioned' | 'duplicate';
      readonly record: AgentTaskExecutionRecord;
    }
  | {
      readonly outcome: 'missing' | 'conflict';
      readonly record?: AgentTaskExecutionRecord;
    };

function toRecord(row: AgentTaskRow): AgentTaskExecutionRecord {
  return {
    taskId: row.id,
    status: row.status,
    jobId: row.executionJobId,
    executionAttemptCount: row.executionAttemptCount,
    deliveryAttempt: row.executionDeliveryAttempt,
    startedAt: row.executionStartedAt,
    succeededAt: row.executionSucceededAt,
    failedAt: row.executionFailedAt,
    lastErrorCode: row.lastExecutionErrorCode,
    lastErrorMessage: row.lastExecutionErrorMessage,
  };
}

export interface AgentTaskExecutionStore {
  begin(
    input: BeginAgentTaskExecutionInput,
  ): Promise<BeginAgentTaskExecutionResult>;
  succeed(
    input: FinishAgentTaskExecutionInput,
  ): Promise<FinishAgentTaskExecutionResult>;
  fail(input: FailAgentTaskExecutionInput): Promise<FinishAgentTaskExecutionResult>;
}

export class DrizzleAgentTaskExecutionStore
  implements AgentTaskExecutionStore
{
  public constructor(private readonly database: Database) {}

  private async find(taskId: string): Promise<AgentTaskExecutionRecord | null> {
    const [row] = await this.database
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  public async begin(
    input: BeginAgentTaskExecutionInput,
  ): Promise<BeginAgentTaskExecutionResult> {
    const [row] = await this.database
      .update(agentTasks)
      .set({
        status: 'running',
        executionJobId: input.jobId,
        executionAttemptCount: sql`${agentTasks.executionAttemptCount} + 1`,
        executionDeliveryAttempt: input.deliveryAttempt,
        executionStartedAt: input.startedAt,
        executionSucceededAt: null,
        executionFailedAt: null,
        lastExecutionErrorCode: null,
        lastExecutionErrorMessage: null,
      })
      .where(
        and(
          eq(agentTasks.id, input.taskId),
          or(
            and(
              eq(agentTasks.status, 'queued'),
              isNull(agentTasks.executionJobId),
            ),
            and(
              eq(agentTasks.status, 'running'),
              eq(agentTasks.executionJobId, input.jobId),
              or(
                isNull(agentTasks.executionDeliveryAttempt),
                lt(
                  agentTasks.executionDeliveryAttempt,
                  input.deliveryAttempt,
                ),
              ),
            ),
          ),
        ),
      )
      .returning();

    if (row) {
      return { outcome: 'started', record: toRecord(row) };
    }

    const existing = await this.find(input.taskId);
    if (!existing) return { outcome: 'missing' };
    if (existing.jobId !== input.jobId) {
      return { outcome: 'conflict', record: existing };
    }
    if (existing.status === 'succeeded') {
      return { outcome: 'already-succeeded', record: existing };
    }
    if (existing.status === 'failed') {
      return { outcome: 'already-failed', record: existing };
    }
    if (existing.status === 'running') {
      return { outcome: 'in-progress', record: existing };
    }
    return { outcome: 'conflict', record: existing };
  }

  public async succeed(
    input: FinishAgentTaskExecutionInput,
  ): Promise<FinishAgentTaskExecutionResult> {
    const [row] = await this.database
      .update(agentTasks)
      .set({
        status: 'succeeded',
        executionSucceededAt: input.finishedAt,
        executionFailedAt: null,
        lastExecutionErrorCode: null,
        lastExecutionErrorMessage: null,
      })
      .where(
        and(
          eq(agentTasks.id, input.taskId),
          eq(agentTasks.status, 'running'),
          eq(agentTasks.executionJobId, input.jobId),
          eq(agentTasks.executionDeliveryAttempt, input.deliveryAttempt),
        ),
      )
      .returning();

    if (row) {
      return { outcome: 'transitioned', record: toRecord(row) };
    }

    const existing = await this.find(input.taskId);
    if (!existing) return { outcome: 'missing' };
    if (
      existing.status === 'succeeded' &&
      existing.jobId === input.jobId &&
      existing.deliveryAttempt === input.deliveryAttempt
    ) {
      return { outcome: 'duplicate', record: existing };
    }
    return { outcome: 'conflict', record: existing };
  }

  public async fail(
    input: FailAgentTaskExecutionInput,
  ): Promise<FinishAgentTaskExecutionResult> {
    const [row] = await this.database
      .update(agentTasks)
      .set({
        status: 'failed',
        executionSucceededAt: null,
        executionFailedAt: input.finishedAt,
        lastExecutionErrorCode: input.errorCode,
        lastExecutionErrorMessage: input.errorMessage,
      })
      .where(
        and(
          eq(agentTasks.id, input.taskId),
          eq(agentTasks.status, 'running'),
          eq(agentTasks.executionJobId, input.jobId),
          eq(agentTasks.executionDeliveryAttempt, input.deliveryAttempt),
        ),
      )
      .returning();

    if (row) {
      return { outcome: 'transitioned', record: toRecord(row) };
    }

    const existing = await this.find(input.taskId);
    if (!existing) return { outcome: 'missing' };
    if (
      existing.status === 'failed' &&
      existing.jobId === input.jobId &&
      existing.deliveryAttempt === input.deliveryAttempt
    ) {
      return { outcome: 'duplicate', record: existing };
    }
    return { outcome: 'conflict', record: existing };
  }
}
