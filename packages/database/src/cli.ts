import path from 'node:path';
import { loadEnvFile } from 'node:process';

import { createMigrationFile, runMigrations } from './migrations';
import { resetDatabase } from './reset';
import { seedDevelopmentData } from './seed';
import { getMigrationStatus } from './status';

function loadEnvironment(): void {
  try {
    loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres protocol.');
  }

  return value;
}

async function main(): Promise<void> {
  loadEnvironment();

  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'create': {
      const filePath = await createMigrationFile(args.join(' '));
      console.log(`Created ${path.relative(process.cwd(), filePath)}`);
      return;
    }
    case 'up':
      await runMigrations({ connectionString: requireDatabaseUrl() });
      return;
    case 'down':
      await runMigrations({
        connectionString: requireDatabaseUrl(),
        direction: 'down',
        count: 1,
      });
      return;
    case 'status': {
      const status = await getMigrationStatus(requireDatabaseUrl());
      console.log(
        JSON.stringify(
          {
            applied: status.applied.map((migration) => ({
              ...migration,
              runOn: migration.runOn.toISOString(),
            })),
            pending: status.pending,
          },
          null,
          2,
        ),
      );
      return;
    }
    case 'seed':
      await seedDevelopmentData(requireDatabaseUrl());
      return;
    case 'reset':
      await resetDatabase(requireDatabaseUrl());
      return;
    default:
      throw new Error(
        'Usage: database <create|up|down|status|seed|reset> [migration name]',
      );
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
