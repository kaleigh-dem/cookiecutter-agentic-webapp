import {
  CreateAgentTask,
  GetAgentTask,
} from '@steadystack/backend-agent-task';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAgentTaskRepository } from './agent-task-repository';
import { createDatabase, type DatabaseConnection } from '../client';
import { runMigrations } from '../migrations';
import { jobOutbox } from '../schema';

describe('DrizzleAgentTaskRepository', () => {
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

  it('persists the task and v2 execution request atomically and enforces ownership', async () => {
    const repository = new DrizzleAgentTaskRepository(connection.database);
    const createTask = new CreateAgentTask(repository, {
      createId: (() => {
        const ids = [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ];
        return () => ids.shift() ?? '33333333-3333-4333-8333-333333333333';
      })(),
      createJobId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-07-31T17:00:00.000Z'),
    });
    const task = await createTask.execute({
      actorId: 'actor-1',
      title: 'Analyze incidents',
      prompt: 'Summarize common root causes.',
    });

    const loaded = await new GetAgentTask(repository).execute(
      task.id,
      'actor-1',
    );
    expect(loaded).toEqual(task);
    await expect(
      new GetAgentTask(repository).execute(task.id, 'actor-2'),
    ).rejects.toThrow('cannot access');

    const outbox = await connection.database.select().from(jobOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'agent-task.execute.v2',
      correlationId: task.correlationId,
      payload: expect.objectContaining({
        version: 2,
        taskId: task.id,
        jobId: '44444444-4444-4444-8444-444444444444',
      }),
    });
  });
});
