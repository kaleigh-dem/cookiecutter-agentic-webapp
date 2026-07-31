import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from './client';
import { runMigrations } from './migrations';
import { resetDatabase } from './reset';
import { seedManifest } from './schema';
import { seedDevelopmentData } from './seed';
import { getMigrationStatus } from './status';

const POSTGRES_IMAGE = 'postgres:17-alpine';

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
    stopContainer = async () => container.stop();
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  it('installs, seeds, rolls back, upgrades, and resets deterministically', async () => {
    await runMigrations({ connectionString });

    let status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toEqual([]);

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
    expect(status.applied).toHaveLength(1);
    expect(status.pending).toEqual(['20260731140100000_add_seed_manifest']);

    await runMigrations({ connectionString });
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toEqual([]);

    await resetDatabase(connectionString, 'test');
    status = await getMigrationStatus(connectionString);
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toEqual([]);
  });

  it('refuses destructive reset in production', async () => {
    await expect(resetDatabase(connectionString, 'production')).rejects.toThrow(
      'disabled in production',
    );
  });
});
