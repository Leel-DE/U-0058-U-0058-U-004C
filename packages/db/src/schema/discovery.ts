import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { stores } from './stores';
import { profiles } from './profiles';

export const siteDiscoveryRuns = pgTable(
  'site_discovery_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    status: text('status').default('queued').notNull(),
    startUrl: text('start_url').notNull(),
    maxPages: integer('max_pages').default(300).notNull(),
    maxProducts: integer('max_products').default(1000).notNull(),
    crawlDepth: integer('crawl_depth').default(4).notNull(),
    mode: text('mode').default('category_scan').notNull(),
    useAi: boolean('use_ai').default(false).notNull(),
    useManualCaptcha: boolean('use_manual_captcha').default(true).notNull(),
    respectRobotsTxt: boolean('respect_robots_txt').default(true).notNull(),
    includePatterns: jsonb('include_patterns').default([]).notNull(),
    excludePatterns: jsonb('exclude_patterns').default([]).notNull(),
    pagesDiscovered: integer('pages_discovered').default(0).notNull(),
    pagesCrawled: integer('pages_crawled').default(0).notNull(),
    categoriesFound: integer('categories_found').default(0).notNull(),
    productsFound: integer('products_found').default(0).notNull(),
    errorsCount: integer('errors_count').default(0).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgCreatedIdx: index('site_discovery_runs_org_created_idx').on(t.orgId, t.startedAt),
    competitorIdx: index('site_discovery_runs_competitor_idx').on(t.competitorId),
  }),
);

export const siteDiscoveryPages = pgTable(
  'site_discovery_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => siteDiscoveryRuns.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    canonicalUrl: text('canonical_url'),
    pageType: text('page_type').notNull(),
    status: text('status').notNull(),
    httpStatus: integer('http_status'),
    depth: integer('depth').default(0).notNull(),
    parentUrl: text('parent_url'),
    title: text('title'),
    h1: text('h1'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    discoveredFrom: text('discovered_from'),
    crawledAt: timestamp('crawled_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    runUrlUnique: uniqueIndex('site_discovery_pages_run_url_unique').on(t.runId, t.normalizedUrl),
    runTypeIdx: index('site_discovery_pages_run_type_idx').on(t.runId, t.pageType),
  }),
);

export const siteDiscoveryCategories = pgTable(
  'site_discovery_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => siteDiscoveryRuns.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    name: text('name').notNull(),
    path: text('path'),
    breadcrumbs: jsonb('breadcrumbs').default([]).notNull(),
    productCountEstimate: integer('product_count_estimate'),
    productsFound: integer('products_found').default(0).notNull(),
    paginationPagesFound: integer('pagination_pages_found').default(0).notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runUrlUnique: uniqueIndex('site_discovery_categories_run_url_unique').on(t.runId, t.url),
    runIdx: index('site_discovery_categories_run_idx').on(t.runId),
  }),
);

export const siteDiscoveryProducts = pgTable(
  'site_discovery_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => siteDiscoveryRuns.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => siteDiscoveryCategories.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    title: text('title'),
    price: numeric('price', { precision: 12, scale: 2 }),
    oldPrice: numeric('old_price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    availability: text('availability'),
    imageUrl: text('image_url'),
    brand: text('brand'),
    sku: text('sku'),
    ean: text('ean'),
    gtin: text('gtin'),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    shipping: text('shipping'),
    categoryPath: text('category_path'),
    breadcrumbs: jsonb('breadcrumbs').default([]).notNull(),
    rawCardJson: jsonb('raw_card_json'),
    rawDetailJson: jsonb('raw_detail_json'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runUrlUnique: uniqueIndex('site_discovery_products_run_url_unique').on(t.runId, t.normalizedUrl),
    runIdx: index('site_discovery_products_run_idx').on(t.runId),
    skuIdx: index('site_discovery_products_sku_idx').on(t.runId, t.sku),
    gtinIdx: index('site_discovery_products_gtin_idx').on(t.runId, t.gtin),
  }),
);

export const siteDiscoveryLogs = pgTable(
  'site_discovery_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => siteDiscoveryRuns.id, { onDelete: 'cascade' }),
    level: text('level').notNull(),
    message: text('message').notNull(),
    contextJson: jsonb('context_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runCreatedIdx: index('site_discovery_logs_run_created_idx').on(t.runId, t.createdAt),
  }),
);

export type SiteDiscoveryRun = typeof siteDiscoveryRuns.$inferSelect;
export type SiteDiscoveryPage = typeof siteDiscoveryPages.$inferSelect;
export type SiteDiscoveryCategory = typeof siteDiscoveryCategories.$inferSelect;
export type SiteDiscoveryProduct = typeof siteDiscoveryProducts.$inferSelect;
export type SiteDiscoveryLog = typeof siteDiscoveryLogs.$inferSelect;
