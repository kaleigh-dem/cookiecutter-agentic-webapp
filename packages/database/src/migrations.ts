import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runner } from 'node-pg-migrate';

export const migrationsDirectory = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

export interface MigrationRunOptions {
  readonly connectionString: string;
  readonly direction?: 'up' | 'down';
  readonly count?: number;
  readonly verbose?: boolean;
}

export async function runMigrations(
  options: MigrationRunOptions,
): Promise<void> {
  await runner({
    databaseUrl: options.connectionString,
    dir: migrationsDirectory,
    direction: options.direction ?? 'up',
    migrationsSchema: 'infra',
    createMigrationsSchema: true,
    migrationsTable: 'migrations',
    checkOrder: true,
    singleTransaction: true,
    advisoryLockMode: 'wait',
    verbose: options.verbose ?? false,
    ...(options.count === undefined ? {} : { count: options.count }),
  });
}

export async function createMigrationFile(name: string): Promise<string> {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalizedName) {
    throw new Error('A descriptive migration name is required.');
  }

  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
  const fileName = `${timestamp}_${normalizedName}.ts`;
  const filePath = path.join(migrationsDirectory, fileName);
  const template = `import type { MigrationBuilder } from 'node-pg-migrate';\n\nexport async function up(pgm: MigrationBuilder): Promise<void> {\n  // Add forward migration operations.\n}\n\nexport async function down(pgm: MigrationBuilder): Promise<void> {\n  // Add explicit rollback operations.\n}\n`;

  await mkdir(migrationsDirectory, { recursive: true });
  await writeFile(filePath, template, { encoding: 'utf-8', flag: 'wx' });
  return filePath;
}
