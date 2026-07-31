import type { MigrationBuilder } from 'node-pg-migrate';

const table = { schema: 'app', name: 'seed_manifest' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(table, {
    dataset: { type: 'text', primaryKey: true },
    version: { type: 'integer', notNull: true },
    checksum: { type: 'text', notNull: true },
    applied_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(table, { ifExists: true });
}
