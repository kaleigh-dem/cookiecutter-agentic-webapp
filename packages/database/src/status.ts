import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

import { migrationsDirectory } from './migrations';

export interface AppliedMigration {
  readonly name: string;
  readonly runOn: Date;
}

export interface MigrationStatus {
  readonly applied: AppliedMigration[];
  readonly pending: string[];
}

interface MigrationRow {
  readonly name: string;
  readonly run_on: Date;
}

export async function getMigrationStatus(
  connectionString: string,
): Promise<MigrationStatus> {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.basename(file, '.ts'))
    .sort();
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const relationResult = await pool.query<{ relation: string | null }>(
      "select to_regclass('infra.migrations')::text as relation",
    );
    const relation = relationResult.rows[0]?.relation;

    if (!relation) {
      return { applied: [], pending: files };
    }

    const result = await pool.query<MigrationRow>(
      'select name, run_on from infra.migrations order by run_on, id',
    );
    const applied = result.rows.map((row) => ({
      name: row.name.replace(/\.(c|m)?(j|t)s$/, ''),
      runOn: row.run_on,
    }));
    const appliedNames = new Set(applied.map((migration) => migration.name));

    return {
      applied,
      pending: files.filter((file) => !appliedNames.has(file)),
    };
  } finally {
    await pool.end();
  }
}
