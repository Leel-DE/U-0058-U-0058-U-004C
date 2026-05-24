import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { stores } from './stores';

export const aiExtractionSuggestions = pgTable(
  'ai_extraction_suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id').references(() => stores.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    cleanedDomHash: text('cleaned_dom_hash').notNull(),
    suggestedRulesJson: jsonb('suggested_rules_json').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    status: text('status').default('suggested').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index('ai_extraction_suggestions_org_idx').on(t.orgId),
    hashIdx: index('ai_extraction_suggestions_hash_idx').on(t.cleanedDomHash),
  }),
);

export const manualScrapingSessions = pgTable(
  'manual_scraping_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id').references(() => stores.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    status: text('status').default('waiting_for_manual_action').notNull(),
    logs: jsonb('logs').default([]).notNull(),
    storageState: text('storage_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    orgIdx: index('manual_scraping_sessions_org_idx').on(t.orgId),
    statusIdx: index('manual_scraping_sessions_status_idx').on(t.status),
  }),
);

export const domainSessions = pgTable(
  'domain_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    domain: text('domain').notNull(),
    storageState: text('storage_state').notNull(),
    cookiesHash: text('cookies_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    domainIdx: index('domain_sessions_domain_idx').on(t.domain),
  }),
);

export const aiLogs = pgTable(
  'ai_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    latencyMs: integer('latency_ms'),
    tokenEstimate: integer('token_estimate'),
    success: boolean('success').default(false).notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    cacheHit: boolean('cache_hit').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    createdAtIdx: index('ai_logs_created_at_idx').on(t.createdAt),
  }),
);

export type AiExtractionSuggestion = typeof aiExtractionSuggestions.$inferSelect;
export type ManualScrapingSession = typeof manualScrapingSessions.$inferSelect;
export type DomainSession = typeof domainSessions.$inferSelect;
export type AiLog = typeof aiLogs.$inferSelect;

