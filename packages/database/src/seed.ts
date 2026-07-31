import { createHash } from 'node:crypto';

import { createDatabase } from './client';
import { seedManifest } from './schema';

const developmentSeed = {
  dataset: 'development',
  version: 1,
} as const;

export async function seedDevelopmentData(
  connectionString: string,
): Promise<void> {
  const checksum = createHash('sha256')
    .update(JSON.stringify(developmentSeed))
    .digest('hex');
  const connection = createDatabase({
    connectionString,
    applicationName: 'agentic-webapp-seed',
    maxConnections: 1,
  });

  try {
    await connection.database
      .insert(seedManifest)
      .values({
        dataset: developmentSeed.dataset,
        version: developmentSeed.version,
        checksum,
      })
      .onConflictDoUpdate({
        target: seedManifest.dataset,
        set: {
          version: developmentSeed.version,
          checksum,
          appliedAt: new Date(),
        },
      });
  } finally {
    await connection.close();
  }
}
