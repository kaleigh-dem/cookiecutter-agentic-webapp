import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from './client';
import { runMigrations } from './migrations';
import { resetDatabase } from './reset';
import { seedManifest } from './schema';
import { seedDevelopmentData } from './seed';
import { getMigrationStatus } from './status';

const execFileAsync = promisify(execFile);
const POSTGRES_IMAGE = 'postgres:17-alpine';

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
    expect(status.applied).toHaveLength(4);
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

    await runMigrations({ connectionString, direction: 'down', count: 1 });
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(3);
    expect(status.pending).toEqual(['20260802110000000_add_outbox_leasing']);

    await runMigrations({ connectionString });
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(4);
    expect(status.pending).toEqual([]);

    await resetDatabase(connectionString, 'test');
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(4);
    expect(status.pending).toEqual([]);
  });

  it('refuses destructive reset in production', async () => {
    await expect(resetDatabase(connectionString, 'production')).rejects.toThrow(
      'disabled in production',
    );
  });
});
