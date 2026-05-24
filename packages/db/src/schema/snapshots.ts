import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  bigserial,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import {
  availabilityEnum,
  runStatusEnum,
  scrapeStrategyEnum,
  snapshotStatusEnum,
} from './enums';
import { organizations } from './organizations';
import { competitorProducts } from './products';
import { stores } from './stores';

export const scrapeRuns = pgTable(
  'scrape_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    triggeredBy: text('triggered_by').default('scheduler').notNull(),
    status: runStatusEnum('status').default('queued').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    productsTotal: integer('products_total').default(0).notNull(),
    productsOk: integer('products_ok').default(0).notNull(),
    productsFailed: integer('products_failed').default(0).notNull(),
    errorSummary: jsonb('error_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('scrape_runs_org_created_idx').on(t.orgId, t.createdAt),
    orgStatusCreatedIdx: index('scrape_runs_org_status_created_idx').on(t.orgId, t.status, t.createdAt),
    storeCreatedIdx: index('scrape_runs_store_created_idx').on(t.storeId, t.createdAt),
  }),
);

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    competitorProductId: uuid('competitor_product_id')
      .notNull()
      .references(() => competitorProducts.id, { onDelete: 'cascade' }),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow().notNull(),
    price: numeric('price', { precision: 12, scale: 2 }),
    oldPrice: numeric('old_price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    availability: availabilityEnum('availability'),
    stockText: text('stock_text'),
    shippingText: text('shipping_text'),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    title: text('title'),
    imageUrl: text('image_url'),
    status: snapshotStatusEnum('status').default('ok').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).default('1').notNull(),
    source: scrapeStrategyEnum('source').notNull(),
    sourcePath: text('source_path'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    rawHtmlStorageKey: text('raw_html_storage_key'),
    scrapeRunId: uuid('scrape_run_id').references(() => scrapeRuns.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
  },
  (t) => ({
    productTimeIdx: index('price_snapshots_product_time_idx').on(t.competitorProductId, t.scrapedAt),
    orgTimeIdx: index('price_snapshots_org_time_idx').on(t.orgId, t.scrapedAt),
    orgStatusTimeIdx: index('price_snapshots_org_status_time_idx').on(t.orgId, t.status, t.scrapedAt),
    runIdx: index('price_snapshots_run_idx').on(t.scrapeRunId),
  }),
);

export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type PriceSnapshotInsert = typeof priceSnapshots.$inferInsert;
