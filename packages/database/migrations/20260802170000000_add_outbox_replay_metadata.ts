import type { MigrationBuilder } from 'node-pg-migrate';

const outbox = { schema: 'app', name: 'job_outbox' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(outbox, {
    replay_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    last_replayed_at: { type: 'timestamptz' },
  });
  pgm.addConstraint(outbox, 'job_outbox_replay_count_check', {
    check: 'replay_count >= 0',
  });
  pgm.sql(`
    create index job_outbox_failed_inspection_idx
      on app.job_outbox (failed_at desc, id)
      where state = 'failed'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop index if exists app.job_outbox_failed_inspection_idx');
  pgm.dropConstraint(outbox, 'job_outbox_replay_count_check', {
    ifExists: true,
  });
  pgm.dropColumns(outbox, ['replay_count', 'last_replayed_at']);
}
