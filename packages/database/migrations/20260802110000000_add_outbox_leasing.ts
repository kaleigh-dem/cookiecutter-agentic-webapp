import type { MigrationBuilder } from 'node-pg-migrate';

const outbox = { schema: 'app', name: 'job_outbox' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(outbox, {
    state: {
      type: 'varchar(32)',
      notNull: true,
      default: 'pending',
    },
    attempt_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    next_attempt_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    claimed_by: { type: 'text' },
    claim_token: { type: 'uuid' },
    claim_expires_at: { type: 'timestamptz' },
    last_error_code: { type: 'text' },
    last_error_message: { type: 'text' },
    last_error_at: { type: 'timestamptz' },
    failed_at: { type: 'timestamptz' },
  });

  pgm.sql(`
    update app.job_outbox
    set
      state = case when processed_at is null then 'pending' else 'processed' end,
      next_attempt_at = created_at
  `);

  pgm.addConstraint(outbox, 'job_outbox_state_check', {
    check: "state in ('pending', 'processing', 'processed', 'failed')",
  });
  pgm.addConstraint(outbox, 'job_outbox_attempt_count_check', {
    check: 'attempt_count >= 0',
  });
  pgm.addConstraint(outbox, 'job_outbox_claim_check', {
    check: `
      (
        state = 'processing'
        and claimed_by is not null
        and claim_token is not null
        and claim_expires_at is not null
      )
      or
      (
        state <> 'processing'
        and claimed_by is null
        and claim_token is null
        and claim_expires_at is null
      )
    `,
  });
  pgm.addConstraint(outbox, 'job_outbox_processed_check', {
    check: "(state = 'processed') = (processed_at is not null)",
  });
  pgm.addConstraint(outbox, 'job_outbox_failed_check', {
    check: "(state = 'failed') = (failed_at is not null)",
  });

  pgm.sql(`
    create index job_outbox_claimable_idx
      on app.job_outbox (next_attempt_at, created_at, id)
      where state in ('pending', 'processing')
  `);
  pgm.sql(`
    create index job_outbox_claim_expiration_idx
      on app.job_outbox (claim_expires_at)
      where state = 'processing'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop index if exists app.job_outbox_claim_expiration_idx');
  pgm.sql('drop index if exists app.job_outbox_claimable_idx');

  pgm.dropConstraint(outbox, 'job_outbox_failed_check', { ifExists: true });
  pgm.dropConstraint(outbox, 'job_outbox_processed_check', { ifExists: true });
  pgm.dropConstraint(outbox, 'job_outbox_claim_check', { ifExists: true });
  pgm.dropConstraint(outbox, 'job_outbox_attempt_count_check', {
    ifExists: true,
  });
  pgm.dropConstraint(outbox, 'job_outbox_state_check', { ifExists: true });

  pgm.dropColumns(outbox, [
    'state',
    'attempt_count',
    'next_attempt_at',
    'claimed_by',
    'claim_token',
    'claim_expires_at',
    'last_error_code',
    'last_error_message',
    'last_error_at',
    'failed_at',
  ]);
}
