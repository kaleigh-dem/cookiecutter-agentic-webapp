import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

export function createDatabase(options: DatabaseOptions) {
  const poolConfig: PoolConfig = {
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? 'steadystack-database-client',
  };
  const pool = new Pool(poolConfig);
  const database = drizzle(pool, { schema });

  return {
    database,
    pool,
    close: async () => pool.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>['database'];
export type DatabaseConnection = ReturnType<typeof createDatabase>;
