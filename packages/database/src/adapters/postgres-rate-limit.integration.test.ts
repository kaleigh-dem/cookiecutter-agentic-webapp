import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type DatabaseConnection } from '../client';
import { runMigrations } from '../migrations';
import { PostgresRateLimitStore } from './postgres-rate-limit';

const POSTGRES_IMAGE = 'postgres:17-alpine';

describe('PostgresRateLimitStore', () => {
  let primary: DatabaseConnection;
  let secondary: DatabaseConnection;
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
    await runMigrations({ connectionString: container.getConnectionUri() });
    primary = createDatabase({
      connectionString: container.getConnectionUri(),
      applicationName: 'rate-limit-primary',
    });
    secondary = createDatabase({
      connectionString: container.getConnectionUri(),
      applicationName: 'rate-limit-secondary',
    });
  });

  beforeEach(async () => {
    await primary.pool.query('truncate table app.rate_limit_windows');
  });

  afterAll(async () => {
    await primary?.close();
    await secondary?.close();
    await stopContainer?.();
  });

  it('shares one atomic window across independent API connections', async () => {
    const first = new PostgresRateLimitStore(primary.pool);
    const second = new PostgresRateLimitStore(secondary.pool);
    const rule = {
      key: 'authenticated:shared-client',
      policy: 'authenticated' as const,
      limit: 1,
      windowMs: 60_000,
    };

    const results = await Promise.all([
      first.consume([rule], new Date('2026-08-03T12:00:00.000Z')),
      second.consume([rule], new Date('2026-08-03T12:00:00.000Z')),
    ]);

    expect(results.filter((result) => result === undefined)).toHaveLength(1);
    expect(results.filter(Boolean)).toEqual([
      {
        policy: 'authenticated',
        count: 2,
        limit: 1,
        resetAt: new Date('2026-08-03T12:01:00.000Z'),
      },
    ]);
  });
});
