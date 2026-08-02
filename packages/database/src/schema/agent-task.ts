import type { AgentTaskExecutionRequested } from '@agentic-webapp/contracts';
import {
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { appSchema } from './platform';

export type AgentTaskRowStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type JobOutboxState = 'pending' | 'processing' | 'processed' | 'failed';

export const agentTasks = appSchema.table('agent_tasks', {
  id: uuid('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  prompt: text('prompt').notNull(),
  status: varchar('status', { length: 32 })
    .$type<AgentTaskRowStatus>()
    .notNull(),
  correlationId: text('correlation_id').notNull(),
  executionJobId: uuid('execution_job_id'),
  executionAttemptCount: integer('execution_attempt_count')
    .notNull()
    .default(0),
  executionDeliveryAttempt: integer('execution_delivery_attempt'),
  executionStartedAt: timestamp('execution_started_at', {
    mode: 'date',
    withTimezone: true,
  }),
  executionSucceededAt: timestamp('execution_succeeded_at', {
    mode: 'date',
    withTimezone: true,
  }),
  executionFailedAt: timestamp('execution_failed_at', {
    mode: 'date',
    withTimezone: true,
  }),
  lastExecutionErrorCode: text('last_execution_error_code'),
  lastExecutionErrorMessage: text('last_execution_error_message'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobOutbox = appSchema.table('job_outbox', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<AgentTaskExecutionRequested>().notNull(),
  correlationId: text('correlation_id').notNull(),
  state: varchar('state', { length: 32 })
    .$type<JobOutboxState>()
    .notNull()
    .default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  claimedBy: text('claimed_by'),
  claimToken: uuid('claim_token'),
  claimExpiresAt: timestamp('claim_expires_at', {
    mode: 'date',
    withTimezone: true,
  }),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  lastErrorAt: timestamp('last_error_at', {
    mode: 'date',
    withTimezone: true,
  }),
  replayCount: integer('replay_count').notNull().default(0),
  lastReplayedAt: timestamp('last_replayed_at', {
    mode: 'date',
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp('processed_at', { mode: 'date', withTimezone: true }),
  failedAt: timestamp('failed_at', { mode: 'date', withTimezone: true }),
});

export type AgentTaskRow = typeof agentTasks.$inferSelect;
export type JobOutboxRow = typeof jobOutbox.$inferSelect;
