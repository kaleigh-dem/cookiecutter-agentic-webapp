import path from 'node:path';
import { loadEnvFile } from 'node:process';

import { PostgresOutboxDelivery } from './adapters/job-outbox-delivery';
import { createDatabase } from './client';
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

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}

function optionalLimit(args: string[]): number | undefined {
  const value = optionValue(args, 'limit');
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('--limit must be an integer.');
  }
  return parsed;
}

async function withOutboxDelivery<T>(
  operation: (delivery: PostgresOutboxDelivery) => Promise<T>,
): Promise<T> {
  const connection = createDatabase({
    connectionString: requireDatabaseUrl(),
    applicationName: 'database-outbox-operator',
    maxConnections: 1,
  });
  try {
    return await operation(new PostgresOutboxDelivery(connection.pool));
  } finally {
    await connection.close();
  }
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
    case 'outbox:list-failed': {
      const messages = await withOutboxDelivery((delivery) =>
        delivery.listFailed({
          ...(optionalLimit(args) === undefined
            ? {}
            : { limit: optionalLimit(args) }),
          ...(optionValue(args, 'kind')
            ? { kind: optionValue(args, 'kind') }
            : {}),
          ...(optionValue(args, 'error-code')
            ? { errorCode: optionValue(args, 'error-code') }
            : {}),
        }),
      );
      console.log(
        JSON.stringify(
          messages.map((message) => ({
            ...message,
            createdAt: message.createdAt.toISOString(),
            failedAt: message.failedAt.toISOString(),
            lastErrorAt: message.lastErrorAt?.toISOString() ?? null,
            lastReplayedAt: message.lastReplayedAt?.toISOString() ?? null,
          })),
          null,
          2,
        ),
      );
      return;
    }
    case 'outbox:replay': {
      const [id] = args;
      if (!id || id.startsWith('--')) {
        throw new Error('outbox:replay requires a failed outbox UUID.');
      }
      const replayed = await withOutboxDelivery((delivery) =>
        delivery.replayFailed({ id }),
      );
      if (!replayed) {
        throw new Error(`Failed outbox message ${id} was not found.`);
      }
      console.log(JSON.stringify({ id, replayed: true }, null, 2));
      return;
    }
    default:
      throw new Error(
        'Usage: database <create|up|down|status|seed|reset|outbox:list-failed|outbox:replay> [arguments]',
      );
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
