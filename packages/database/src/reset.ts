import { runMigrations } from './migrations';
import { seedDevelopmentData } from './seed';
import { getMigrationStatus } from './status';

export async function resetDatabase(
  connectionString: string,
  environment = process.env.NODE_ENV ?? 'development',
): Promise<void> {
  if (environment === 'production') {
    throw new Error('Database reset is disabled in production.');
  }

  const status = await getMigrationStatus(connectionString);
  if (status.applied.length > 0) {
    await runMigrations({
      connectionString,
      direction: 'down',
      count: status.applied.length,
    });
  }

  await runMigrations({ connectionString });
  await seedDevelopmentData(connectionString);
}
