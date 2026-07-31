import type { MigrationBuilder } from 'node-pg-migrate';

const tasks = { schema: 'app', name: 'agent_tasks' } as const;
const outbox = { schema: 'app', name: 'job_outbox' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(tasks, {
    id: { type: 'uuid', primaryKey: true },
    owner_id: { type: 'text', notNull: true },
    title: { type: 'varchar(120)', notNull: true },
    prompt: { type: 'text', notNull: true },
    status: { type: 'varchar(32)', notNull: true },
    correlation_id: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint(tasks, 'agent_tasks_status_check', {
    check: "status in ('queued', 'running', 'completed', 'failed')",
  });
  pgm.createIndex(tasks, ['owner_id', 'created_at']);

  pgm.createTable(outbox, {
    id: { type: 'uuid', primaryKey: true },
    kind: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    correlation_id: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    processed_at: { type: 'timestamptz' },
  });
  pgm.createIndex(outbox, ['processed_at', 'created_at']);
  pgm.createIndex(outbox, 'correlation_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(outbox, { ifExists: true });
  pgm.dropTable(tasks, { ifExists: true });
}
