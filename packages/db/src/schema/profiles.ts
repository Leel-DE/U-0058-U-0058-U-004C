import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Mirrors auth.users(id). Populated by a trigger in 0000_init.sql.
 * We never insert here directly from app code.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
