import {
  pgTable,
  uuid,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { orgRoleEnum, invitationStatusEnum } from './enums';
import { profiles } from './profiles';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').default('free').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    crawlBudgetMinutes: text('crawl_budget_minutes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    slugUnique: uniqueIndex('organizations_slug_unique').on(t.slug),
  }),
);

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId] }),
    userIdx: index('memberships_user_idx').on(t.userId),
  }),
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull(),
    token: text('token').notNull(),
    status: invitationStatusEnum('status').default('pending').notNull(),
    invitedBy: uuid('invited_by').references(() => profiles.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('invitations_token_unique').on(t.token),
    orgEmailIdx: index('invitations_org_email_idx').on(t.orgId, t.email),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
