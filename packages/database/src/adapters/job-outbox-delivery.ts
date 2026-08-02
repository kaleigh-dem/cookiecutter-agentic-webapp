import { randomUUID } from 'node:crypto';

import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';
import type { Pool } from 'pg';

const MAX_BATCH_SIZE = 100;
const MAX_INSPECTION_LIMIT = 100;
const MAX_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_WORKER_ID_LENGTH = 200;
const MAX_ERROR_CODE_LENGTH = 100;
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_EVENT_KIND_LENGTH = 200;
const MAX_REPLAYED_BY_LENGTH = 200;
const MAX_REPLAY_REASON_LENGTH = 500;

export interface OutboxClaimReference {
  readonly id: string;
  readonly workerId: string;
  readonly claimToken: string;
}

export interface ClaimOutboxOptions {
  readonly workerId: string;
  readonly batchSize: number;
  readonly leaseDurationMs: number;
}

export interface ClaimedOutboxMessage extends OutboxClaimReference {
  readonly kind: string;
  readonly payload: AgentTaskExecutionRequested;
  readonly correlationId: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date;
  readonly claimExpiresAt: Date;
  readonly createdAt: Date;
}

export interface RenewOutboxClaimOptions extends OutboxClaimReference {
  readonly leaseDurationMs: number;
}

export interface RescheduleOutboxOptions extends OutboxClaimReference {
  readonly nextAttemptAt: Date;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface FailOutboxOptions extends OutboxClaimReference {
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface ListFailedOutboxOptions {
  readonly limit?: number;
  readonly kind?: string;
  readonly errorCode?: string;
}

export interface ReplayFailedOutboxOptions {
  readonly id: string;
  readonly replayedBy: string;
  readonly reason: string;
  readonly replayAt?: Date;
}

export interface FailedOutboxMessage {
  readonly id: string;
  readonly kind: string;
  readonly taskId: string | null;
  readonly payloadVersion: number | null;
  readonly correlationId: string;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: Date | null;
  readonly failedAt: Date;
  readonly replayCount: number;
  readonly lastReplayedAt: Date | null;
  readonly lastReplayedBy: string | null;
  readonly lastReplayReason: string | null;
  readonly createdAt: Date;
}

export interface OutboxQueueMetrics {
  readonly queueDepth: number;
  readonly oldestMessageAgeMs: number;
}

interface ClaimedOutboxRow {
  readonly id: string;
  readonly kind: string;
  readonly payload: AgentTaskExecutionRequested;
  readonly correlationId: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date;
  readonly claimedBy: string;
  readonly claimToken: string;
  readonly claimExpiresAt: Date;
  readonly createdAt: Date;
}

interface FailedOutboxRow {
  readonly id: string;
  readonly kind: string;
  readonly taskId: string | null;
  readonly payloadVersion: number | null;
  readonly correlationId: string;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: Date | null;
  readonly failedAt: Date;
  readonly replayCount: number;
  readonly lastReplayedAt: Date | null;
  readonly lastReplayedBy: string | null;
  readonly lastReplayReason: string | null;
  readonly createdAt: Date;
}

interface ClaimExpirationRow {
  readonly claimExpiresAt: Date;
}

interface OutboxQueueMetricsRow {
  readonly queueDepth: number;
  readonly oldestMessageAgeMs: number;
}

function requireBoundedInteger(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function requireWorkerId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_WORKER_ID_LENGTH) {
    throw new Error(
      `workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters.`,
    );
  }
  return normalized;
}

function requireUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new Error(`${label} must be a UUID.`);
  }
  return normalized;
}

function requireDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid Date.`);
  }
  return value;
}

function requireErrorText(
  value: string,
  label: string,
  maximum: number,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(
      `${label} must contain between 1 and ${maximum} characters.`,
    );
  }
  return normalized;
}

function optionalFilter(
  value: string | undefined,
  label: string,
  maximum: number,
): string | null {
  if (value === undefined) return null;
  return requireErrorText(value, label, maximum);
}

function normalizeClaimReference(
  reference: OutboxClaimReference,
): OutboxClaimReference {
  return {
    id: requireUuid(reference.id, 'id'),
    workerId: requireWorkerId(reference.workerId),
    claimToken: requireUuid(reference.claimToken, 'claimToken'),
  };
}

export class PostgresOutboxDelivery {
  public constructor(private readonly pool: Pool) {}

  public async getQueueMetrics(): Promise<OutboxQueueMetrics> {
    const result = await this.pool.query<OutboxQueueMetricsRow>(
      `
        select
          count(*) filter (
            where state in ('pending', 'processing')
          )::integer as "queueDepth",
          greatest(
            0,
            coalesce(
              extract(
                epoch from (
                  current_timestamp - min(created_at) filter (
                    where state in ('pending', 'processing')
                  )
                )
              ) * 1000,
              0
            )
          )::double precision as "oldestMessageAgeMs"
        from app.job_outbox
      `,
    );

    return result.rows[0] ?? { queueDepth: 0, oldestMessageAgeMs: 0 };
  }

  public async claim(
    options: ClaimOutboxOptions,
  ): Promise<ClaimedOutboxMessage[]> {
    const workerId = requireWorkerId(options.workerId);
    const batchSize = requireBoundedInteger(
      options.batchSize,
      'batchSize',
      MAX_BATCH_SIZE,
    );
    const leaseDurationMs = requireBoundedInteger(
      options.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    );
    const claimToken = randomUUID();

    const result = await this.pool.query<ClaimedOutboxRow>(
      `
        with eligible as (
          select id
          from app.job_outbox
          where
            (
              state = 'pending'
              and next_attempt_at <= current_timestamp
            )
            or
            (
              state = 'processing'
              and claim_expires_at <= current_timestamp
            )
          order by next_attempt_at, created_at, id
          limit $2::integer
          for update skip locked
        ),
        claimed as (
          update app.job_outbox as outbox
          set
            state = 'processing',
            attempt_count = outbox.attempt_count + 1,
            claimed_by = $1,
            claim_token = $4::uuid,
            claim_expires_at =
              current_timestamp + ($3::integer * interval '1 millisecond')
          from eligible
          where outbox.id = eligible.id
          returning
            outbox.id,
            outbox.kind,
            outbox.payload,
            outbox.correlation_id as "correlationId",
            outbox.attempt_count as "attemptCount",
            outbox.next_attempt_at as "nextAttemptAt",
            outbox.claimed_by as "claimedBy",
            outbox.claim_token as "claimToken",
            outbox.claim_expires_at as "claimExpiresAt",
            outbox.created_at as "createdAt"
        )
        select *
        from claimed
        order by "nextAttemptAt", "createdAt", id
      `,
      [workerId, batchSize, leaseDurationMs, claimToken],
    );

    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      correlationId: row.correlationId,
      attemptCount: row.attemptCount,
      nextAttemptAt: row.nextAttemptAt,
      workerId: row.claimedBy,
      claimToken: row.claimToken,
      claimExpiresAt: row.claimExpiresAt,
      createdAt: row.createdAt,
    }));
  }

  public async renew(options: RenewOutboxClaimOptions): Promise<Date | null> {
    const reference = normalizeClaimReference(options);
    const leaseDurationMs = requireBoundedInteger(
      options.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    );

    const result = await this.pool.query<ClaimExpirationRow>(
      `
        update app.job_outbox
        set claim_expires_at =
          current_timestamp + ($4::integer * interval '1 millisecond')
        where
          id = $1::uuid
          and state = 'processing'
          and claimed_by = $2
          and claim_token = $3::uuid
          and claim_expires_at > current_timestamp
        returning claim_expires_at as "claimExpiresAt"
      `,
      [reference.id, reference.workerId, reference.claimToken, leaseDurationMs],
    );

    return result.rows[0]?.claimExpiresAt ?? null;
  }

  public async acknowledge(reference: OutboxClaimReference): Promise<boolean> {
    const normalized = normalizeClaimReference(reference);
    const result = await this.pool.query<{ readonly id: string }>(
      `
        update app.job_outbox
        set
          state = 'processed',
          processed_at = current_timestamp,
          claimed_by = null,
          claim_token = null,
          claim_expires_at = null
        where
          id = $1::uuid
          and state = 'processing'
          and claimed_by = $2
          and claim_token = $3::uuid
          and claim_expires_at > current_timestamp
        returning id
      `,
      [normalized.id, normalized.workerId, normalized.claimToken],
    );

    return result.rows.length === 1;
  }

  public async reschedule(options: RescheduleOutboxOptions): Promise<boolean> {
    const reference = normalizeClaimReference(options);
    const nextAttemptAt = requireDate(options.nextAttemptAt, 'nextAttemptAt');
    const errorCode = requireErrorText(
      options.errorCode,
      'errorCode',
      MAX_ERROR_CODE_LENGTH,
    );
    const errorMessage = requireErrorText(
      options.errorMessage,
      'errorMessage',
      MAX_ERROR_MESSAGE_LENGTH,
    );

    const result = await this.pool.query<{ readonly id: string }>(
      `
        update app.job_outbox
        set
          state = 'pending',
          next_attempt_at = $4,
          claimed_by = null,
          claim_token = null,
          claim_expires_at = null,
          last_error_code = $5,
          last_error_message = $6,
          last_error_at = current_timestamp
        where
          id = $1::uuid
          and state = 'processing'
          and claimed_by = $2
          and claim_token = $3::uuid
          and claim_expires_at > current_timestamp
        returning id
      `,
      [
        reference.id,
        reference.workerId,
        reference.claimToken,
        nextAttemptAt,
        errorCode,
        errorMessage,
      ],
    );

    return result.rows.length === 1;
  }

  public async fail(options: FailOutboxOptions): Promise<boolean> {
    const reference = normalizeClaimReference(options);
    const errorCode = requireErrorText(
      options.errorCode,
      'errorCode',
      MAX_ERROR_CODE_LENGTH,
    );
    const errorMessage = requireErrorText(
      options.errorMessage,
      'errorMessage',
      MAX_ERROR_MESSAGE_LENGTH,
    );

    const result = await this.pool.query<{ readonly id: string }>(
      `
        update app.job_outbox
        set
          state = 'failed',
          failed_at = current_timestamp,
          claimed_by = null,
          claim_token = null,
          claim_expires_at = null,
          last_error_code = $4,
          last_error_message = $5,
          last_error_at = current_timestamp
        where
          id = $1::uuid
          and state = 'processing'
          and claimed_by = $2
          and claim_token = $3::uuid
          and claim_expires_at > current_timestamp
        returning id
      `,
      [
        reference.id,
        reference.workerId,
        reference.claimToken,
        errorCode,
        errorMessage,
      ],
    );

    return result.rows.length === 1;
  }

  public async listFailed(
    options: ListFailedOutboxOptions = {},
  ): Promise<FailedOutboxMessage[]> {
    const limit = requireBoundedInteger(
      options.limit ?? 50,
      'limit',
      MAX_INSPECTION_LIMIT,
    );
    const kind = optionalFilter(options.kind, 'kind', MAX_EVENT_KIND_LENGTH);
    const errorCode = optionalFilter(
      options.errorCode,
      'errorCode',
      MAX_ERROR_CODE_LENGTH,
    );
    const result = await this.pool.query<FailedOutboxRow>(
      `
        select
          id,
          kind,
          payload ->> 'taskId' as "taskId",
          case
            when jsonb_typeof(payload -> 'version') = 'number'
              then (payload ->> 'version')::integer
            else null
          end as "payloadVersion",
          correlation_id as "correlationId",
          attempt_count as "attemptCount",
          last_error_code as "lastErrorCode",
          last_error_message as "lastErrorMessage",
          last_error_at as "lastErrorAt",
          failed_at as "failedAt",
          replay_count as "replayCount",
          last_replayed_at as "lastReplayedAt",
          last_replayed_by as "lastReplayedBy",
          last_replay_reason as "lastReplayReason",
          created_at as "createdAt"
        from app.job_outbox
        where
          state = 'failed'
          and ($2::text is null or kind = $2)
          and ($3::text is null or last_error_code = $3)
        order by failed_at desc, id
        limit $1::integer
      `,
      [limit, kind, errorCode],
    );
    return result.rows;
  }

  public async replayFailed(
    options: ReplayFailedOutboxOptions,
  ): Promise<boolean> {
    const id = requireUuid(options.id, 'id');
    const replayAt = requireDate(options.replayAt ?? new Date(), 'replayAt');
    const replayedBy = requireErrorText(
      options.replayedBy,
      'replayedBy',
      MAX_REPLAYED_BY_LENGTH,
    );
    const reason = requireErrorText(
      options.reason,
      'reason',
      MAX_REPLAY_REASON_LENGTH,
    );
    const result = await this.pool.query<{ readonly id: string }>(
      `
        with replayed as (
          update app.job_outbox
          set
            state = 'pending',
            attempt_count = 0,
            next_attempt_at = $2,
            claimed_by = null,
            claim_token = null,
            claim_expires_at = null,
            processed_at = null,
            failed_at = null,
            replay_count = replay_count + 1,
            last_replayed_at = $2,
            last_replayed_by = $3,
            last_replay_reason = $4
          where id = $1::uuid and state = 'failed'
          returning id, payload
        ),
        reset_task as (
          update app.agent_tasks as task
          set
            status = 'queued',
            execution_job_id = null,
            execution_delivery_attempt = null,
            execution_started_at = null,
            execution_succeeded_at = null,
            execution_failed_at = null,
            last_execution_error_code = null,
            last_execution_error_message = null
          from replayed
          where
            task.id::text = replayed.payload ->> 'taskId'
            and task.status = 'failed'
            and task.execution_job_id = replayed.id
          returning task.id
        )
        select replayed.id
        from replayed
        left join reset_task on true
        limit 1
      `,
      [id, replayAt, replayedBy, reason],
    );
    return result.rows.length === 1;
  }
}
