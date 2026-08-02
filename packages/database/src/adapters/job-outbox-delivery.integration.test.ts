import { randomUUID } from 'node:crypto';

import type { AgentTaskExecutionRequestedV2 } from '@agentic-webapp/contracts';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type DatabaseConnection } from '../client';
import { runMigrations } from '../migrations';
import { jobOutbox } from '../schema';
import { PostgresOutboxDelivery } from './job-outbox-delivery';

const POSTGRES_IMAGE = 'postgres:17-alpine';
const LEASE_DURATION_MS = 30_000;

interface MessageOptions {
  readonly id?: string;
  readonly createdAt?: Date;
  readonly nextAttemptAt?: Date;
}

function executionPayload(jobId: string): AgentTaskExecutionRequestedV2 {
  return {
    version: 2,
    taskId: randomUUID(),
    actorId: 'actor-1',
    userId: 'actor-1',
    prompt: 'Execute the task',
    requestId: `request-${jobId}`,
    traceId: `trace-${jobId}`,
    jobId,
    correlationId: `correlation-${jobId}`,
    occurredAt: new Date().toISOString(),
  };
}

async function insertMessage(
  connection: DatabaseConnection,
  options: MessageOptions = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  const payload = executionPayload(id);
  await connection.database.insert(jobOutbox).values({
    id,
    kind: 'agent-task.execute.v2',
    payload,
    correlationId: payload.correlationId,
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    ...(options.nextAttemptAt ? { nextAttemptAt: options.nextAttemptAt } : {}),
  });
  return id;
}

describe('PostgresOutboxDelivery', () => {
  let connectionString = '';
  let primary: DatabaseConnection;
  let secondary: DatabaseConnection;
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('app')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    connectionString = container.getConnectionUri();
    stopContainer = async () => {
      await container.stop();
    };

    await runMigrations({ connectionString });
    primary = createDatabase({
      connectionString,
      applicationName: 'outbox-delivery-primary',
      maxConnections: 5,
    });
    secondary = createDatabase({
      connectionString,
      applicationName: 'outbox-delivery-secondary',
      maxConnections: 5,
    });
  });

  beforeEach(async () => {
    await primary.pool.query(
      'truncate table app.job_outbox, app.agent_tasks restart identity cascade',
    );
  });

  afterAll(async () => {
    await primary?.close();
    await secondary?.close();
    await stopContainer?.();
  });

  it('claims eligible messages in deterministic priority order', async () => {
    const now = Date.now();
    const first = await insertMessage(primary, {
      createdAt: new Date(now - 10_000),
      nextAttemptAt: new Date(now - 30_000),
    });
    const second = await insertMessage(primary, {
      createdAt: new Date(now - 20_000),
      nextAttemptAt: new Date(now - 20_000),
    });
    await insertMessage(primary, {
      createdAt: new Date(now - 10_000),
      nextAttemptAt: new Date(now - 20_000),
    });
    await insertMessage(primary, {
      nextAttemptAt: new Date(now + 60_000),
    });

    const delivery = new PostgresOutboxDelivery(primary.pool);
    const claimed = await delivery.claim({
      workerId: 'worker-a',
      batchSize: 2,
      leaseDurationMs: LEASE_DURATION_MS,
    });

    expect(claimed.map((message) => message.id)).toEqual([first, second]);
    expect(claimed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attemptCount: 1,
          workerId: 'worker-a',
        }),
      ]),
    );
    expect(claimed[0]?.claimToken).toBe(claimed[1]?.claimToken);
    expect(claimed[0]?.claimExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('prevents overlapping claims across concurrent worker replicas', async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, () => insertMessage(primary)),
    );
    const firstDelivery = new PostgresOutboxDelivery(primary.pool);
    const secondDelivery = new PostgresOutboxDelivery(secondary.pool);

    const [firstClaims, secondClaims] = await Promise.all([
      firstDelivery.claim({
        workerId: 'worker-a',
        batchSize: 4,
        leaseDurationMs: LEASE_DURATION_MS,
      }),
      secondDelivery.claim({
        workerId: 'worker-b',
        batchSize: 4,
        leaseDurationMs: LEASE_DURATION_MS,
      }),
    ]);

    const firstIds = new Set(firstClaims.map((message) => message.id));
    const secondIds = new Set(secondClaims.map((message) => message.id));
    expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([]);
    expect(new Set([...firstIds, ...secondIds])).toEqual(new Set(ids));

    const rows = await primary.database.select().from(jobOutbox);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.state === 'processing')).toBe(true);
    expect(rows.every((row) => row.attemptCount === 1)).toBe(true);
    expect(
      rows.every((row) =>
        ['worker-a', 'worker-b'].includes(row.claimedBy ?? ''),
      ),
    ).toBe(true);
  });

  it('recovers an expired lease and rejects stale ownership updates', async () => {
    const id = await insertMessage(primary);
    const firstDelivery = new PostgresOutboxDelivery(primary.pool);
    const secondDelivery = new PostgresOutboxDelivery(secondary.pool);

    const [firstClaim] = await firstDelivery.claim({
      workerId: 'worker-a',
      batchSize: 1,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    expect(firstClaim).toBeDefined();
    if (!firstClaim) return;

    const renewedUntil = await firstDelivery.renew({
      ...firstClaim,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    expect(renewedUntil).toBeInstanceOf(Date);
    expect(
      await firstDelivery.acknowledge({
        ...firstClaim,
        claimToken: randomUUID(),
      }),
    ).toBe(false);

    await primary.pool.query(
      `
        update app.job_outbox
        set claim_expires_at = current_timestamp - interval '1 second'
        where id = $1::uuid
      `,
      [id],
    );

    expect(
      await firstDelivery.renew({
        ...firstClaim,
        leaseDurationMs: LEASE_DURATION_MS,
      }),
    ).toBeNull();

    const [recoveredClaim] = await secondDelivery.claim({
      workerId: 'worker-b',
      batchSize: 1,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    expect(recoveredClaim).toMatchObject({ id, attemptCount: 2 });
    expect(recoveredClaim?.claimToken).not.toBe(firstClaim.claimToken);
    if (!recoveredClaim) return;

    expect(await firstDelivery.acknowledge(firstClaim)).toBe(false);
    expect(await secondDelivery.acknowledge(recoveredClaim)).toBe(true);

    const [row] = await primary.database
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, id));
    expect(row).toMatchObject({
      state: 'processed',
      attemptCount: 2,
      claimedBy: null,
      claimToken: null,
      claimExpiresAt: null,
    });
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  it('reschedules retryable work and records terminal failures', async () => {
    const retryId = await insertMessage(primary);
    const failedId = await insertMessage(primary);
    const firstDelivery = new PostgresOutboxDelivery(primary.pool);
    const secondDelivery = new PostgresOutboxDelivery(secondary.pool);

    const claims = await firstDelivery.claim({
      workerId: 'worker-a',
      batchSize: 2,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    const retryClaim = claims.find((claim) => claim.id === retryId);
    const failedClaim = claims.find((claim) => claim.id === failedId);
    expect(retryClaim).toBeDefined();
    expect(failedClaim).toBeDefined();
    if (!retryClaim || !failedClaim) return;

    const retryAt = new Date(Date.now() + 60_000);
    expect(
      await firstDelivery.reschedule({
        ...retryClaim,
        nextAttemptAt: retryAt,
        errorCode: 'dependency_unavailable',
        errorMessage: 'The dependency is temporarily unavailable.',
      }),
    ).toBe(true);
    expect(
      await firstDelivery.fail({
        ...failedClaim,
        errorCode: 'invalid_contract',
        errorMessage: 'The event contract is invalid.',
      }),
    ).toBe(true);

    expect(
      await secondDelivery.claim({
        workerId: 'worker-b',
        batchSize: 2,
        leaseDurationMs: LEASE_DURATION_MS,
      }),
    ).toEqual([]);

    const [retryRow] = await primary.database
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, retryId));
    expect(retryRow).toMatchObject({
      state: 'pending',
      attemptCount: 1,
      claimedBy: null,
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCode: 'dependency_unavailable',
      lastErrorMessage: 'The dependency is temporarily unavailable.',
      failedAt: null,
    });
    expect(retryRow?.lastErrorAt).toBeInstanceOf(Date);
    expect(retryRow?.nextAttemptAt.getTime()).toBe(retryAt.getTime());

    const [failedRow] = await primary.database
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, failedId));
    expect(failedRow).toMatchObject({
      state: 'failed',
      attemptCount: 1,
      claimedBy: null,
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCode: 'invalid_contract',
      lastErrorMessage: 'The event contract is invalid.',
    });
    expect(failedRow?.lastErrorAt).toBeInstanceOf(Date);
    expect(failedRow?.failedAt).toBeInstanceOf(Date);

    await primary.pool.query(
      `
        update app.job_outbox
        set next_attempt_at = current_timestamp - interval '1 second'
        where id = $1::uuid
      `,
      [retryId],
    );

    const recovered = await secondDelivery.claim({
      workerId: 'worker-b',
      batchSize: 2,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    expect(recovered).toEqual([
      expect.objectContaining({ id: retryId, attemptCount: 2 }),
    ]);
  });
});
