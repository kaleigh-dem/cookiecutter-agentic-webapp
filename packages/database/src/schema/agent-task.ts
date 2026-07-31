import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';
import { jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { appSchema } from './platform';

export const agentTasks = appSchema.table('agent_tasks', {
  id: uuid('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  prompt: text('prompt').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  correlationId: text('correlation_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobOutbox = appSchema.table('job_outbox', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<AgentTaskExecutionRequested>().notNull(),
  correlationId: text('correlation_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp('processed_at', { mode: 'date', withTimezone: true }),
});

export type AgentTaskRow = typeof agentTasks.$inferSelect;
export type JobOutboxRow = typeof jobOutbox.$inferSelect;
