import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { stores } from './stores';
import { categories } from './taxonomy';
import { profiles } from './profiles';

export const myProducts = pgTable(
  'my_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    gtin: text('gtin'),
    brand: text('brand'),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    myPrice: numeric('my_price', { precision: 12, scale: 2 }),
    currency: text('currency').notNull(),
    url: text('url'),
    imageUrl: text('image_url'),
    active: boolean('active').default(true).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgSkuUnique: uniqueIndex('my_products_org_sku_unique').on(t.orgId, t.sku),
    orgActiveIdx: index('my_products_org_active_idx').on(t.orgId, t.active),
    orgGtinIdx: index('my_products_org_gtin_idx').on(t.orgId, t.gtin),
    orgCategoryIdx: index('my_products_org_category_idx').on(t.orgId, t.categoryId),
  }),
);

export const competitorProducts = pgTable(
  'competitor_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: text('url_hash').notNull(),
    externalId: text('external_id'),
    title: text('title'),
    brand: text('brand'),
    sku: text('sku'),
    gtin: text('gtin'),
    imageUrl: text('image_url'),
    active: boolean('active').default(true).notNull(),
    lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
    lastChangeAt: timestamp('last_change_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow(),
    selectorFailureCount: integer('selector_failure_count').default(0).notNull(),
    lastSnapshotPrice: numeric('last_snapshot_price', { precision: 12, scale: 2 }),
    lastSnapshotCurrency: text('last_snapshot_currency'),
    lastSnapshotAvailability: text('last_snapshot_availability'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    storeUrlUnique: uniqueIndex('competitor_products_store_url_unique').on(t.storeId, t.urlHash),
    nextRunIdx: index('competitor_products_next_run_idx').on(t.nextRunAt),
    orgStoreIdx: index('competitor_products_org_store_idx').on(t.orgId, t.storeId),
    orgActiveIdx: index('competitor_products_org_active_idx').on(t.orgId, t.active),
    orgLastScrapedIdx: index('competitor_products_org_last_scraped_idx').on(t.orgId, t.lastScrapedAt),
  }),
);

export type MyProduct = typeof myProducts.$inferSelect;
export type CompetitorProduct = typeof competitorProducts.$inferSelect;
