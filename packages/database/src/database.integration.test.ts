import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAgentTaskExecutionStore } from './adapters/agent-task-execution';
import { createDatabase } from './client';
import { runMigrations } from './migrations';
import { resetDatabase } from './reset';
import { seedManifest } from './schema';
import { seedDevelopmentData } from './seed';
import { getMigrationStatus } from './status';

const execFileAsync = promisify(execFile);
const POSTGRES_IMAGE = 'postgres:17-alpine';
const legacyRunningTaskId = '99999999-9999-4999-8999-999999999999';
const legacyCompletedTaskId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const legacyRunningJobId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const legacyCreatedAt = new Date('2026-07-31T17:00:00.000Z');

async function withTemporaryEnvironmentFile(
  content: string,
  callback: () => Promise<void>,
): Promise<void> {
  const environmentPath = path.resolve(process.cwd(), '.env');
  let previousContent: string | undefined;

  try {
    previousContent = await readFile(environmentPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(environmentPath, content, 'utf-8');

  try {
    await callback();
  } finally {
    if (previousContent === undefined) {
      await rm(environmentPath, { force: true });
    } else {
      await writeFile(environmentPath, previousContent, 'utf-8');
    }
  }
}

describe('database foundation', () => {
  let connectionString = '';
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
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  it('installs, seeds, rolls back, upgrades, and resets deterministically', async () => {
    await runMigrations({ connectionString });

    let status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(7);
    expect(status.pending).toEqual([]);

    await withTemporaryEnvironmentFile(
      `DATABASE_URL=${connectionString}\nNODE_ENV=test\n`,
      async () => {
        const environment = { ...process.env };
        delete environment.DATABASE_URL;
        delete environment.NODE_ENV;

        const { stdout } = await execFileAsync(
          process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
          ['db:status'],
          {
            cwd: process.cwd(),
            env: environment,
            maxBuffer: 10 * 1024 * 1024,
          },
        );

        expect(stdout).toContain('20260731140100000_add_seed_manifest');
        expect(stdout).toContain(
          '20260802160000000_add_agent_task_execution_state',
        );
        expect(stdout).toContain(
          '20260802170000000_add_outbox_replay_metadata',
        );
        expect(stdout).toContain(
          '20260803130000000_add_distributed_rate_limits',
        );
        expect(stdout).toContain('"pending": []');
      },
    );

    await seedDevelopmentData(connectionString);
    const connection = createDatabase({ connectionString, maxConnections: 1 });
    try {
      const rows = await connection.database.select().from(seedManifest);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ dataset: 'development', version: 1 });
    } finally {
      await connection.close();
    }

    await runMigrations({ connectionString, direction: 'down', count: 3 });
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(4);
    expect(status.pending).toEqual([
      '20260802160000000_add_agent_task_execution_state',
      '20260802170000000_add_outbox_replay_metadata',
      '20260803130000000_add_distributed_rate_limits',
    ]);

    const legacyConnection = createDatabase({
      connectionString,
      maxConnections: 1,
    });
    try {
      await legacyConnection.pool.query(
        `
          insert into app.agent_tasks (
            id, owner_id, title, prompt, status, correlation_id, created_at
          ) values
            ($1, 'actor-1', 'Legacy running task', 'Resume safely.', 'running', 'legacy-running', $3),
            ($2, 'actor-1', 'Legacy completed task', 'Keep complete.', 'completed', 'legacy-completed', $3)
        `,
        [legacyRunningTaskId, legacyCompletedTaskId, legacyCreatedAt],
      );
    } finally {
      await legacyConnection.close();
    }

    await runMigrations({ connectionString });
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(7);
    expect(status.pending).toEqual([]);

    const migratedConnection = createDatabase({
      connectionString,
      maxConnections: 1,
    });
    try {
      const { rows } = await migratedConnection.pool.query<{
        id: string;
        status: string;
        executionJobId: string | null;
        executionDeliveryAttempt: number | null;
        executionStartedAt: Date | null;
        executionSucceededAt: Date | null;
      }>(
        `
          select
            id,
            status,
            execution_job_id as "executionJobId",
            execution_delivery_attempt as "executionDeliveryAttempt",
            execution_started_at as "executionStartedAt",
            execution_succeeded_at as "executionSucceededAt"
          from app.agent_tasks
          where id = any($1::uuid[])
        `,
        [[legacyRunningTaskId, legacyCompletedTaskId]],
      );
      const migratedRows = Object.fromEntries(rows.map((row) => [row.id, row]));
      expect(migratedRows[legacyRunningTaskId]).toMatchObject({
        status: 'running',
        executionJobId: null,
        executionDeliveryAttempt: null,
        executionStartedAt: legacyCreatedAt,
      });
      expect(migratedRows[legacyCompletedTaskId]).toMatchObject({
        status: 'succeeded',
        executionSucceededAt: legacyCreatedAt,
      });

      const execution = new DrizzleAgentTaskExecutionStore(
        migratedConnection.database,
      );
      await expect(
        execution.begin({
          taskId: legacyRunningTaskId,
          jobId: legacyRunningJobId,
          deliveryAttempt: 1,
          startedAt: new Date('2026-08-02T15:00:00.000Z'),
        }),
      ).resolves.toMatchObject({
        outcome: 'started',
        record: {
          jobId: legacyRunningJobId,
          deliveryAttempt: 1,
        },
      });
    } finally {
      await migratedConnection.close();
    }

    await resetDatabase(connectionString, 'test');
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(7);
    expect(status.pending).toEqual([]);
  });

  it('refuses destructive reset in production', async () => {
    await expect(resetDatabase(connectionString, 'production')).rejects.toThrow(
      'disabled in production',
    );
  });
});
