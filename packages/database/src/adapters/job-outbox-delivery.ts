import { randomUUID } from 'node:crypto';

import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';
import type { Pool } from 'pg';

const MAX_BATCH_SIZE = 100;
const MAX_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_WORKER_ID_LENGTH = 200;
const MAX_ERROR_CODE_LENGTH = 100;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

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

interface ClaimExpirationRow {
  readonly claimExpiresAt: Date;
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
}
