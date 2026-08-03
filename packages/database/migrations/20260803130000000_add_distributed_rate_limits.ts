import type { MigrationBuilder } from 'node-pg-migrate';

const table = { schema: 'app', name: 'rate_limit_windows' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(table, {
    bucket_key: { type: 'text', primaryKey: true },
    request_count: { type: 'integer', notNull: true },
    reset_at: { type: 'timestamptz', notNull: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint(table, 'rate_limit_windows_request_count_check', {
    check: 'request_count > 0',
  });
  pgm.createIndex(table, 'reset_at');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(table, { ifExists: true });
}
