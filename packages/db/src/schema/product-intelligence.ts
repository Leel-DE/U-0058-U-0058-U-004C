import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { categories } from './taxonomy';
import { myProducts, competitorProducts } from './products';

export const normalizedProducts = pgTable(
  'normalized_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    canonicalTitle: text('canonical_title').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    brand: text('brand'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    imageUrl: text('image_url'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).default('0.750').notNull(),
    source: text('source').default('heuristic').notNull(),
    manuallyReviewed: boolean('manually_reviewed').default(false).notNull(),
    duplicateOfId: uuid('duplicate_of_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgKeyUnique: uniqueIndex('normalized_products_org_key_unique').on(t.orgId, t.normalizedKey),
    orgBrandIdx: index('normalized_products_org_brand_idx').on(t.orgId, t.brand),
    orgCategoryIdx: index('normalized_products_org_category_idx').on(t.orgId, t.categoryId),
    orgUpdatedIdx: index('normalized_products_org_updated_idx').on(t.orgId, t.updatedAt),
  }),
);

export const normalizedProductAliases = pgTable(
  'normalized_product_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    normalizedProductId: uuid('normalized_product_id')
      .notNull()
      .references(() => normalizedProducts.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasKey: text('alias_key').notNull(),
    source: text('source').default('heuristic').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).default('0.750').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgAliasUnique: uniqueIndex('normalized_product_aliases_org_alias_unique').on(t.orgId, t.aliasKey),
    productIdx: index('normalized_product_aliases_product_idx').on(t.normalizedProductId),
  }),
);

export const productSpecifications = pgTable(
  'product_specifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    normalizedProductId: uuid('normalized_product_id')
      .notNull()
      .references(() => normalizedProducts.id, { onDelete: 'cascade' }),
    brand: text('brand'),
    model: text('model'),
    year: integer('year'),
    motor: text('motor'),
    battery: text('battery'),
    batteryWh: integer('battery_wh'),
    fork: text('fork'),
    rearShock: text('rear_shock'),
    drivetrain: text('drivetrain'),
    brakes: text('brakes'),
    wheels: text('wheels'),
    wheelSize: text('wheel_size'),
    frameMaterial: text('frame_material'),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    travelMm: integer('travel_mm'),
    color: text('color'),
    size: text('size'),
    gender: text('gender'),
    bikeType: text('bike_type'),
    rawSpecs: jsonb('raw_specs').default({}).notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).default('0.650').notNull(),
    source: text('source').default('heuristic').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productUnique: uniqueIndex('product_specifications_product_unique').on(t.normalizedProductId),
    orgBatteryIdx: index('product_specifications_org_battery_idx').on(t.orgId, t.batteryWh),
    orgWheelIdx: index('product_specifications_org_wheel_idx').on(t.orgId, t.wheelSize),
  }),
);

export const productPriceHistory = pgTable(
  'product_price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    normalizedProductId: uuid('normalized_product_id')
      .notNull()
      .references(() => normalizedProducts.id, { onDelete: 'cascade' }),
    bucketDate: date('bucket_date').notNull(),
    minPrice: numeric('min_price', { precision: 12, scale: 2 }),
    avgPrice: numeric('avg_price', { precision: 12, scale: 2 }),
    maxPrice: numeric('max_price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    competitorsCount: integer('competitors_count').default(0).notNull(),
    volatilityScore: numeric('volatility_score', { precision: 8, scale: 3 }).default('0').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productDateUnique: uniqueIndex('product_price_history_product_date_unique').on(t.normalizedProductId, t.bucketDate),
    orgDateIdx: index('product_price_history_org_date_idx').on(t.orgId, t.bucketDate),
  }),
);

export const productAvailabilityHistory = pgTable(
  'product_availability_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    normalizedProductId: uuid('normalized_product_id')
      .notNull()
      .references(() => normalizedProducts.id, { onDelete: 'cascade' }),
    bucketDate: date('bucket_date').notNull(),
    inStockCount: integer('in_stock_count').default(0).notNull(),
    outOfStockCount: integer('out_of_stock_count').default(0).notNull(),
    unknownCount: integer('unknown_count').default(0).notNull(),
    stockRatio: numeric('stock_ratio', { precision: 6, scale: 3 }).default('0').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productDateUnique: uniqueIndex('product_availability_history_product_date_unique').on(t.normalizedProductId, t.bucketDate),
    orgDateIdx: index('product_availability_history_org_date_idx').on(t.orgId, t.bucketDate),
  }),
);

export const productMatchingLogs = pgTable(
  'product_matching_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    normalizedProductId: uuid('normalized_product_id').references(() => normalizedProducts.id, { onDelete: 'set null' }),
    myProductId: uuid('my_product_id').references(() => myProducts.id, { onDelete: 'set null' }),
    competitorProductId: uuid('competitor_product_id').references(() => competitorProducts.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    method: text('method').notNull(),
    score: numeric('score', { precision: 5, scale: 3 }),
    reasons: jsonb('reasons').default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('product_matching_logs_org_created_idx').on(t.orgId, t.createdAt),
    competitorIdx: index('product_matching_logs_competitor_idx').on(t.competitorProductId),
  }),
);

export const productInsightsCache = pgTable(
  'product_insights_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    insightType: text('insight_type').notNull(),
    entityId: text('entity_id'),
    severity: text('severity').default('info').notNull(),
    title: text('title').notNull(),
    details: jsonb('details').default({}).notNull(),
    metricValue: numeric('metric_value', { precision: 14, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    orgTypeIdx: index('product_insights_cache_org_type_idx').on(t.orgId, t.insightType),
    orgSeverityIdx: index('product_insights_cache_org_severity_idx').on(t.orgId, t.severity),
  }),
);

export type NormalizedProduct = typeof normalizedProducts.$inferSelect;
export type NormalizedProductAlias = typeof normalizedProductAliases.$inferSelect;
export type ProductSpecification = typeof productSpecifications.$inferSelect;
export type ProductInsightCache = typeof productInsightsCache.$inferSelect;
