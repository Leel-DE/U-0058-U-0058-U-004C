import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { alertTypeEnum, notifChannelEnum, notifStatusEnum } from './enums';
import { organizations } from './organizations';
import { myProducts, competitorProducts } from './products';
import { stores } from './stores';
import { profiles } from './profiles';

export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: alertTypeEnum('type').notNull(),
    params: jsonb('params').default({}).notNull(),
    scopeMyProductId: uuid('scope_my_product_id').references(() => myProducts.id, {
      onDelete: 'cascade',
    }),
    scopeCompetitorProductId: uuid('scope_competitor_product_id').references(
      () => competitorProducts.id,
      { onDelete: 'cascade' },
    ),
    scopeStoreId: uuid('scope_store_id').references(() => stores.id, { onDelete: 'cascade' }),
    channels: notifChannelEnum('channels').array().notNull(),
    active: boolean('active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgActiveIdx: index('alert_rules_org_active_idx').on(t.orgId, t.active),
  }),
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    alertRuleId: uuid('alert_rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload'),
    channel: notifChannelEnum('channel').notNull(),
    status: notifStatusEnum('status').default('pending').notNull(),
    dedupKey: text('dedup_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userUnreadIdx: index('notifications_user_unread_idx').on(t.userId, t.createdAt),
    orgCreatedIdx: index('notifications_org_created_idx').on(t.orgId, t.createdAt),
    dedupIdx: index('notifications_dedup_idx').on(t.dedupKey),
  }),
);

export type AlertRule = typeof alertRules.$inferSelect;
export type AlertRuleInsert = typeof alertRules.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
