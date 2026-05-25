import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  numeric,
} from 'drizzle-orm/pg-core';
import { storeStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    countryCode: text('country_code').notNull(),
    currency: text('currency').notNull(),
    crawlFrequencyMinutes: integer('crawl_frequency_minutes').default(1440).notNull(),
    crawlDelaySeconds: integer('crawl_delay_seconds').default(5).notNull(),
    respectRobots: boolean('respect_robots').default(true).notNull(),
    jsRequired: boolean('js_required').default(false).notNull(),
    status: storeStatusEnum('status').default('active').notNull(),
    robotsTxtStatus: text('robots_txt_status'),
    robotsTxtCheckedAt: timestamp('robots_txt_checked_at', { withTimezone: true }),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    lastSuccessfulScrapeAt: timestamp('last_successful_scrape_at', { withTimezone: true }),
    errorRate24h: numeric('error_rate_24h', { precision: 5, scale: 4 }),
    avgResponseMs: integer('avg_response_ms'),
    discoveryPreset: text('discovery_preset'),
    discoveryDefaultsJson: jsonb('discovery_defaults_json'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgDomainUnique: uniqueIndex('stores_org_domain_unique').on(t.orgId, t.domain),
    orgStatusIdx: index('stores_org_status_idx').on(t.orgId, t.status),
  }),
);

export const scrapingRules = pgTable(
  'scraping_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    titleSelector: text('title_selector'),
    priceSelector: text('price_selector'),
    oldPriceSelector: text('old_price_selector'),
    availabilitySelector: text('availability_selector'),
    imageSelector: text('image_selector'),
    brandSelector: text('brand_selector'),
    skuSelector: text('sku_selector'),
    breadcrumbsSelector: text('breadcrumbs_selector'),
    productCardSelector: text('product_card_selector'),
    cardTitleSelector: text('card_title_selector'),
    cardPriceSelector: text('card_price_selector'),
    cardOldPriceSelector: text('card_old_price_selector'),
    cardImageSelector: text('card_image_selector'),
    cardLinkSelector: text('card_link_selector'),
    cardAvailabilitySelector: text('card_availability_selector'),
    paginationNextSelector: text('pagination_next_selector'),
    loadMoreSelector: text('load_more_selector'),
    shippingSelector: text('shipping_selector'),
    ratingSelector: text('rating_selector'),
    priceRegex: text('price_regex'),
    useJsonLd: boolean('use_json_ld').default(true).notNull(),
    useOpenGraph: boolean('use_open_graph').default(true).notNull(),
    customUserAgent: text('custom_user_agent'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    storeUnique: uniqueIndex('scraping_rules_store_unique').on(t.storeId),
  }),
);

export const competitorProfiles = pgTable(
  'competitor_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    framework: text('framework'),
    renderingStrategy: text('rendering_strategy'),
    scrapeDifficulty: text('scrape_difficulty'),
    antiBotRisk: text('anti_bot_risk'),
    recommendedMode: text('recommended_mode'),
    detectionConfidence: numeric('detection_confidence', { precision: 5, scale: 4 }),
    autoDetectedSettingsJson: jsonb('auto_detected_settings_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    storeUnique: uniqueIndex('competitor_profiles_store_unique').on(t.storeId),
    frameworkIdx: index('competitor_profiles_framework_idx').on(t.framework),
  }),
);

export type Store = typeof stores.$inferSelect;
export type StoreInsert = typeof stores.$inferInsert;
export type ScrapingRules = typeof scrapingRules.$inferSelect;
export type CompetitorProfile = typeof competitorProfiles.$inferSelect;
