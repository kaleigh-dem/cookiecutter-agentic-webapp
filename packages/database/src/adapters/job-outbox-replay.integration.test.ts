import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type DatabaseConnection } from '../client';
import { runMigrations } from '../migrations';
import { agentTasks, jobOutbox } from '../schema';
import { PostgresOutboxDelivery } from './job-outbox-delivery';

const POSTGRES_IMAGE = 'postgres:17-alpine';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

async function insertDeadLetter(connection: DatabaseConnection): Promise<void> {
  const failedAt = new Date('2026-08-02T16:00:00.000Z');
  await connection.database.insert(agentTasks).values({
    id: TASK_ID,
    ownerId: 'actor-1',
    title: 'Retry task',
    prompt: 'Execute the task',
    status: 'failed',
    correlationId: 'correlation-1',
    executionJobId: JOB_ID,
    executionAttemptCount: 5,
    executionDeliveryAttempt: 5,
    executionStartedAt: new Date('2026-08-02T15:59:00.000Z'),
    executionFailedAt: failedAt,
    lastExecutionErrorCode: 'dependency_timeout',
    lastExecutionErrorMessage: 'Agent Task execution failed temporarily.',
  });
  await connection.database.insert(jobOutbox).values({
    id: JOB_ID,
    kind: 'agent-task.execute.v2',
    payload: {
      version: 2,
      taskId: TASK_ID,
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Execute the task',
      requestId: 'request-1',
      traceId: '33333333333333333333333333333333',
      jobId: JOB_ID,
      correlationId: 'correlation-1',
      occurredAt: '2026-08-02T15:58:00.000Z',
    },
    correlationId: 'correlation-1',
    state: 'failed',
    attemptCount: 5,
    nextAttemptAt: failedAt,
    lastErrorCode: 'dependency_timeout',
    lastErrorMessage: 'Agent Task execution failed temporarily.',
    lastErrorAt: failedAt,
    failedAt,
  });
}

describe('PostgresOutboxDelivery dead-letter operations', () => {
  let connection: DatabaseConnection;
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('app')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    stopContainer = async () => {
      await container.stop();
    };
    const connectionString = container.getConnectionUri();
    await runMigrations({ connectionString });
    connection = createDatabase({
      connectionString,
      applicationName: 'outbox-replay-test',
      maxConnections: 3,
    });
  });

  beforeEach(async () => {
    await connection.pool.query(
      'truncate table app.job_outbox, app.agent_tasks restart identity cascade',
    );
  });

  afterAll(async () => {
    await connection?.close();
    await stopContainer?.();
  });

  it('inspects safe dead-letter metadata and atomically requeues failed task execution', async () => {
    await insertDeadLetter(connection);
    const delivery = new PostgresOutboxDelivery(connection.pool);

    await expect(
      delivery.listFailed({
        kind: 'agent-task.execute.v2',
        errorCode: 'dependency_timeout',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: JOB_ID,
        taskId: TASK_ID,
        payloadVersion: 2,
        attemptCount: 5,
        lastErrorCode: 'dependency_timeout',
        replayCount: 0,
        lastReplayedAt: null,
        lastReplayedBy: null,
        lastReplayReason: null,
      }),
    ]);

    const replayAt = new Date('2026-08-02T17:00:00.000Z');
    await expect(
      delivery.replayFailed({
        id: JOB_ID,
        replayAt,
        replayedBy: 'operator@example.com',
        reason: 'Database dependency recovered after incident INC-42.',
      }),
    ).resolves.toBe(true);

    const [outbox] = await connection.database
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, JOB_ID));
    expect(outbox).toMatchObject({
      state: 'pending',
      attemptCount: 0,
      nextAttemptAt: replayAt,
      failedAt: null,
      replayCount: 1,
      lastReplayedAt: replayAt,
      lastReplayedBy: 'operator@example.com',
      lastReplayReason: 'Database dependency recovered after incident INC-42.',
      lastErrorCode: 'dependency_timeout',
      lastErrorMessage: 'Agent Task execution failed temporarily.',
    });

    const [task] = await connection.database
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, TASK_ID));
    expect(task).toMatchObject({
      status: 'queued',
      executionJobId: null,
      executionAttemptCount: 5,
      executionDeliveryAttempt: null,
      executionStartedAt: null,
      executionSucceededAt: null,
      executionFailedAt: null,
      lastExecutionErrorCode: null,
      lastExecutionErrorMessage: null,
    });

    const claimed = await delivery.claim({
      workerId: 'worker-replay',
      batchSize: 1,
      leaseDurationMs: 30_000,
    });
    expect(claimed).toEqual([
      expect.objectContaining({ id: JOB_ID, attemptCount: 1 }),
    ]);
  });

  it('rejects unaudited replay and non-failed rows', async () => {
    await insertDeadLetter(connection);
    const delivery = new PostgresOutboxDelivery(connection.pool);

    await expect(
      delivery.replayFailed({ id: JOB_ID, replayedBy: '', reason: 'fixed' }),
    ).rejects.toThrow('replayedBy');
    await expect(
      delivery.replayFailed({
        id: JOB_ID,
        replayedBy: 'operator@example.com',
        reason: 'Dependency recovered.',
      }),
    ).resolves.toBe(true);
    await expect(
      delivery.replayFailed({
        id: JOB_ID,
        replayedBy: 'operator@example.com',
        reason: 'Duplicate replay should not be accepted.',
      }),
    ).resolves.toBe(false);
  });
});
