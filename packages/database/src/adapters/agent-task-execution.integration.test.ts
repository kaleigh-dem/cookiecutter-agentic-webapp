import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAgentTaskExecutionStore } from './agent-task-execution';
import { createDatabase, type DatabaseConnection } from '../client';
import { runMigrations } from '../migrations';
import { agentTasks } from '../schema';

const firstTaskId = '11111111-1111-4111-8111-111111111111';
const firstJobId = '22222222-2222-4222-8222-222222222222';
const secondTaskId = '33333333-3333-4333-8333-333333333333';
const secondJobId = '44444444-4444-4444-8444-444444444444';
const legacyRunningTaskId = '55555555-5555-4555-8555-555555555555';
const legacyRunningJobId = '66666666-6666-4666-8666-666666666666';
const legacySucceededTaskId = '77777777-7777-4777-8777-777777777777';
const legacySucceededJobId = '88888888-8888-4888-8888-888888888888';

async function insertQueuedTask(
  connection: DatabaseConnection,
  taskId: string,
): Promise<void> {
  await connection.database.insert(agentTasks).values({
    id: taskId,
    ownerId: 'actor-1',
    title: 'Execute task',
    prompt: 'Complete the work.',
    status: 'queued',
    correlationId: `correlation-${taskId}`,
    createdAt: new Date('2026-08-02T15:00:00.000Z'),
  });
}

async function insertLegacyTask(
  connection: DatabaseConnection,
  taskId: string,
  status: 'running' | 'succeeded',
  succeededAt: Date | null = null,
): Promise<void> {
  await connection.database.insert(agentTasks).values({
    id: taskId,
    ownerId: 'actor-1',
    title: 'Legacy task',
    prompt: 'Complete the migrated work.',
    status,
    correlationId: `correlation-${taskId}`,
    createdAt: new Date('2026-07-31T17:00:00.000Z'),
    executionSucceededAt: succeededAt,
  });
}

describe('DrizzleAgentTaskExecutionStore', () => {
  let connection: DatabaseConnection;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('app')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    stop = async () => {
      await container.stop();
    };
    await runMigrations({ connectionString: container.getConnectionUri() });
    connection = createDatabase({
      connectionString: container.getConnectionUri(),
      maxConnections: 2,
    });
  });

  afterAll(async () => {
    await connection?.close();
    await stop?.();
  });

  it('fences stale delivery attempts and makes terminal success idempotent', async () => {
    await insertQueuedTask(connection, firstTaskId);
    const store = new DrizzleAgentTaskExecutionStore(connection.database);

    const first = await store.begin({
      taskId: firstTaskId,
      jobId: firstJobId,
      deliveryAttempt: 1,
      startedAt: new Date('2026-08-02T15:01:00.000Z'),
    });
    expect(first).toMatchObject({
      outcome: 'started',
      record: {
        status: 'running',
        executionAttemptCount: 1,
        deliveryAttempt: 1,
      },
    });

    await expect(
      store.begin({
        taskId: firstTaskId,
        jobId: firstJobId,
        deliveryAttempt: 1,
        startedAt: new Date('2026-08-02T15:01:05.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'in-progress' });

    const resumed = await store.begin({
      taskId: firstTaskId,
      jobId: firstJobId,
      deliveryAttempt: 2,
      startedAt: new Date('2026-08-02T15:02:00.000Z'),
    });
    expect(resumed).toMatchObject({
      outcome: 'started',
      record: {
        executionAttemptCount: 2,
        deliveryAttempt: 2,
      },
    });

    await expect(
      store.begin({
        taskId: firstTaskId,
        jobId: secondJobId,
        deliveryAttempt: 3,
        startedAt: new Date('2026-08-02T15:03:00.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'conflict' });

    await expect(
      store.succeed({
        taskId: firstTaskId,
        jobId: firstJobId,
        deliveryAttempt: 1,
        finishedAt: new Date('2026-08-02T15:03:30.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'conflict' });

    const succeeded = await store.succeed({
      taskId: firstTaskId,
      jobId: firstJobId,
      deliveryAttempt: 2,
      finishedAt: new Date('2026-08-02T15:04:00.000Z'),
    });
    expect(succeeded).toMatchObject({
      outcome: 'transitioned',
      record: {
        status: 'succeeded',
        succeededAt: new Date('2026-08-02T15:04:00.000Z'),
      },
    });

    await expect(
      store.succeed({
        taskId: firstTaskId,
        jobId: firstJobId,
        deliveryAttempt: 2,
        finishedAt: new Date('2026-08-02T15:04:30.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'duplicate' });

    await expect(
      store.begin({
        taskId: firstTaskId,
        jobId: firstJobId,
        deliveryAttempt: 3,
        startedAt: new Date('2026-08-02T15:05:00.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'already-succeeded' });
  });

  it('adopts legacy running and terminal rows without regressing state', async () => {
    const migratedAt = new Date('2026-07-31T17:00:00.000Z');
    await insertLegacyTask(connection, legacyRunningTaskId, 'running');
    await insertLegacyTask(
      connection,
      legacySucceededTaskId,
      'succeeded',
      migratedAt,
    );
    const store = new DrizzleAgentTaskExecutionStore(connection.database);

    await expect(
      store.begin({
        taskId: legacyRunningTaskId,
        jobId: legacyRunningJobId,
        deliveryAttempt: 1,
        startedAt: new Date('2026-08-02T15:06:00.000Z'),
      }),
    ).resolves.toMatchObject({
      outcome: 'started',
      record: {
        status: 'running',
        jobId: legacyRunningJobId,
        deliveryAttempt: 1,
        executionAttemptCount: 1,
      },
    });

    await expect(
      store.begin({
        taskId: legacySucceededTaskId,
        jobId: legacySucceededJobId,
        deliveryAttempt: 1,
        startedAt: new Date('2026-08-02T15:07:00.000Z'),
      }),
    ).resolves.toMatchObject({
      outcome: 'already-succeeded',
      record: {
        status: 'succeeded',
        jobId: legacySucceededJobId,
        deliveryAttempt: 1,
        succeededAt: migratedAt,
      },
    });
  });

  it('persists terminal failure metadata without allowing regression', async () => {
    await insertQueuedTask(connection, secondTaskId);
    const store = new DrizzleAgentTaskExecutionStore(connection.database);

    await store.begin({
      taskId: secondTaskId,
      jobId: secondJobId,
      deliveryAttempt: 1,
      startedAt: new Date('2026-08-02T15:10:00.000Z'),
    });
    const failed = await store.fail({
      taskId: secondTaskId,
      jobId: secondJobId,
      deliveryAttempt: 1,
      finishedAt: new Date('2026-08-02T15:11:00.000Z'),
      errorCode: 'dependency_error',
      errorMessage: 'The downstream service was unavailable.',
    });

    expect(failed).toMatchObject({
      outcome: 'transitioned',
      record: {
        status: 'failed',
        failedAt: new Date('2026-08-02T15:11:00.000Z'),
        lastErrorCode: 'dependency_error',
        lastErrorMessage: 'The downstream service was unavailable.',
      },
    });

    await expect(
      store.succeed({
        taskId: secondTaskId,
        jobId: secondJobId,
        deliveryAttempt: 1,
        finishedAt: new Date('2026-08-02T15:12:00.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'conflict' });
    await expect(
      store.begin({
        taskId: secondTaskId,
        jobId: secondJobId,
        deliveryAttempt: 2,
        startedAt: new Date('2026-08-02T15:13:00.000Z'),
      }),
    ).resolves.toMatchObject({ outcome: 'already-failed' });
  });
});
