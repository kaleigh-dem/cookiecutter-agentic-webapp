import { integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('app');

export const seedManifest = appSchema.table('seed_manifest', {
  dataset: text('dataset').primaryKey(),
  version: integer('version').notNull(),
  checksum: text('checksum').notNull(),
  appliedAt: timestamp('applied_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export type SeedManifestRow = typeof seedManifest.$inferSelect;
export type NewSeedManifestRow = typeof seedManifest.$inferInsert;

export const rateLimitWindows = appSchema.table('rate_limit_windows', {
  bucketKey: text('bucket_key').primaryKey(),
  requestCount: integer('request_count').notNull(),
  resetAt: timestamp('reset_at', {
    mode: 'date',
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
});
