import {
  boolean,
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
import { profiles } from './profiles';
import { competitorProducts } from './products';
import { scrapeRuns } from './snapshots';
import { stores } from './stores';

export const selectorVersions = pgTable(
  'selector_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    selectorType: text('selector_type').notNull(),
    selectorValue: text('selector_value'),
    source: text('source').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    validationJson: jsonb('validation_json'),
    previousSelectorValue: text('previous_selector_value'),
    changedBy: uuid('changed_by').references(() => profiles.id, { onDelete: 'set null' }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    rolledBackFromId: uuid('rolled_back_from_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    storeVersionUnique: uniqueIndex('selector_versions_store_type_version_unique').on(
      t.storeId,
      t.selectorType,
      t.version,
    ),
    storeTypeCreatedIdx: index('selector_versions_store_type_created_idx').on(
      t.storeId,
      t.selectorType,
      t.createdAt,
    ),
  }),
);

export const extractionDebugArtifacts = pgTable(
  'extraction_debug_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    competitorProductId: uuid('competitor_product_id').references(() => competitorProducts.id, {
      onDelete: 'set null',
    }),
    scrapeRunId: uuid('scrape_run_id').references(() => scrapeRuns.id, { onDelete: 'set null' }),
    snapshotId: text('snapshot_id'),
    url: text('url').notNull(),
    status: text('status').notNull(),
    errorType: text('error_type'),
    errorMessage: text('error_message'),
    htmlStorageKey: text('html_storage_key'),
    htmlSnapshot: text('html_snapshot'),
    screenshotStorageKey: text('screenshot_storage_key'),
    selectorSetJson: jsonb('selector_set_json').notNull(),
    extractedJson: jsonb('extracted_json'),
    confidenceJson: jsonb('confidence_json'),
    logsJson: jsonb('logs_json').default([]).notNull(),
    replayable: boolean('replayable').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('extraction_debug_artifacts_org_created_idx').on(t.orgId, t.createdAt),
    productCreatedIdx: index('extraction_debug_artifacts_product_created_idx').on(
      t.competitorProductId,
      t.createdAt,
    ),
    statusIdx: index('extraction_debug_artifacts_status_idx').on(t.orgId, t.status, t.createdAt),
  }),
);

export const crawlDomainHealth = pgTable(
  'crawl_domain_health',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    successRate: numeric('success_rate', { precision: 5, scale: 4 }).default('0').notNull(),
    avgResponseMs: integer('avg_response_ms'),
    captchaRate: numeric('captcha_rate', { precision: 5, scale: 4 }).default('0').notNull(),
    retryCount: integer('retry_count').default(0).notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    recommendedStrategy: text('recommended_strategy'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgDomainUnique: uniqueIndex('crawl_domain_health_org_domain_unique').on(t.orgId, t.domain),
    orgHealthIdx: index('crawl_domain_health_org_updated_idx').on(t.orgId, t.updatedAt),
  }),
);

export const serviceHeartbeats = pgTable(
  'service_heartbeats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    service: text('service').notNull(),
    instanceId: text('instance_id').notNull(),
    status: text('status').default('ok').notNull(),
    metadataJson: jsonb('metadata_json').default({}).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serviceInstanceUnique: uniqueIndex('service_heartbeats_service_instance_unique').on(
      t.service,
      t.instanceId,
    ),
    serviceSeenIdx: index('service_heartbeats_service_seen_idx').on(t.service, t.lastSeenAt),
  }),
);

export type SelectorVersion = typeof selectorVersions.$inferSelect;
export type ExtractionDebugArtifact = typeof extractionDebugArtifacts.$inferSelect;
export type CrawlDomainHealth = typeof crawlDomainHealth.$inferSelect;
export type ServiceHeartbeat = typeof serviceHeartbeats.$inferSelect;
