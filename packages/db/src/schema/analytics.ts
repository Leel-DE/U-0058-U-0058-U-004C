import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { stores } from './stores';
import { categories } from './taxonomy';
import { myProducts } from './products';

export const analyticsDailyRollups = pgTable(
  'analytics_daily_rollups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    bucketDate: date('bucket_date').notNull(),
    metrics: jsonb('metrics').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgDateUnique: uniqueIndex('analytics_daily_rollups_org_date_unique').on(t.orgId, t.bucketDate),
  }),
);

export const competitorDailyRollups = pgTable(
  'competitor_daily_rollups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    bucketDate: date('bucket_date').notNull(),
    productsCount: integer('products_count').default(0).notNull(),
    avgPrice: numeric('avg_price', { precision: 12, scale: 2 }),
    avgDiscount: numeric('avg_discount', { precision: 8, scale: 2 }),
    aggressivenessScore: numeric('aggressiveness_score', { precision: 6, scale: 2 }).default('0').notNull(),
    dataQualityScore: numeric('data_quality_score', { precision: 6, scale: 2 }).default('0').notNull(),
    metrics: jsonb('metrics').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competitorDateUnique: uniqueIndex('competitor_daily_rollups_competitor_date_unique').on(t.competitorId, t.bucketDate),
    orgDateIdx: index('competitor_daily_rollups_org_date_idx').on(t.orgId, t.bucketDate),
  }),
);

export const categoryDailyRollups = pgTable(
  'category_daily_rollups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categoryName: text('category_name').notNull(),
    bucketDate: date('bucket_date').notNull(),
    productsCount: integer('products_count').default(0).notNull(),
    avgPrice: numeric('avg_price', { precision: 12, scale: 2 }),
    volatilityScore: numeric('volatility_score', { precision: 6, scale: 2 }).default('0').notNull(),
    metrics: jsonb('metrics').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    categoryDateUnique: uniqueIndex('category_daily_rollups_category_date_unique').on(t.orgId, t.categoryName, t.bucketDate),
    orgDateIdx: index('category_daily_rollups_org_date_idx').on(t.orgId, t.bucketDate),
  }),
);

export const productDailyRollups = pgTable(
  'product_daily_rollups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => myProducts.id, { onDelete: 'cascade' }),
    entityKey: text('entity_key').notNull(),
    bucketDate: date('bucket_date').notNull(),
    minPrice: numeric('min_price', { precision: 12, scale: 2 }),
    avgPrice: numeric('avg_price', { precision: 12, scale: 2 }),
    maxPrice: numeric('max_price', { precision: 12, scale: 2 }),
    stockRatio: numeric('stock_ratio', { precision: 6, scale: 3 }),
    volatilityScore: numeric('volatility_score', { precision: 6, scale: 2 }).default('0').notNull(),
    metrics: jsonb('metrics').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productDateUnique: uniqueIndex('product_daily_rollups_product_date_unique').on(t.orgId, t.entityKey, t.bucketDate),
    orgDateIdx: index('product_daily_rollups_org_date_idx').on(t.orgId, t.bucketDate),
  }),
);
