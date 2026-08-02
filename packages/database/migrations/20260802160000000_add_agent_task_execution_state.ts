import type { MigrationBuilder } from 'node-pg-migrate';

const tasks = { schema: 'app', name: 'agent_tasks' } as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(tasks, {
    execution_job_id: { type: 'uuid' },
    execution_attempt_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    execution_delivery_attempt: { type: 'integer' },
    execution_started_at: { type: 'timestamptz' },
    execution_succeeded_at: { type: 'timestamptz' },
    execution_failed_at: { type: 'timestamptz' },
    last_execution_error_code: { type: 'text' },
    last_execution_error_message: { type: 'text' },
  });

  pgm.dropConstraint(tasks, 'agent_tasks_status_check');
  pgm.sql(`
    update app.agent_tasks
    set status = 'succeeded'
    where status = 'completed'
  `);
  pgm.addConstraint(tasks, 'agent_tasks_status_check', {
    check: "status in ('queued', 'running', 'succeeded', 'failed')",
  });
  pgm.addConstraint(tasks, 'agent_tasks_execution_attempt_count_check', {
    check: 'execution_attempt_count >= 0',
  });
  pgm.addConstraint(tasks, 'agent_tasks_execution_delivery_attempt_check', {
    check:
      'execution_delivery_attempt is null or execution_delivery_attempt > 0',
  });
  pgm.addConstraint(tasks, 'agent_tasks_execution_terminal_check', {
    check: `
      not (
        execution_succeeded_at is not null
        and execution_failed_at is not null
      )
    `,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(tasks, 'agent_tasks_execution_terminal_check', {
    ifExists: true,
  });
  pgm.dropConstraint(tasks, 'agent_tasks_execution_delivery_attempt_check', {
    ifExists: true,
  });
  pgm.dropConstraint(tasks, 'agent_tasks_execution_attempt_count_check', {
    ifExists: true,
  });
  pgm.dropConstraint(tasks, 'agent_tasks_status_check', { ifExists: true });

  pgm.sql(`
    update app.agent_tasks
    set status = 'completed'
    where status = 'succeeded'
  `);
  pgm.addConstraint(tasks, 'agent_tasks_status_check', {
    check: "status in ('queued', 'running', 'completed', 'failed')",
  });

  pgm.dropColumns(tasks, [
    'execution_job_id',
    'execution_attempt_count',
    'execution_delivery_attempt',
    'execution_started_at',
    'execution_succeeded_at',
    'execution_failed_at',
    'last_execution_error_code',
    'last_execution_error_message',
  ]);
}
