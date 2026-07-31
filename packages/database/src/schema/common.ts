import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const identifier = (name = 'id') => uuid(name).primaryKey();

export const createdAt = () =>
  timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow();

export const deletedAt = () =>
  timestamp('deleted_at', { mode: 'date', withTimezone: true });
