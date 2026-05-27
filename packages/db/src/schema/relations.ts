import { relations } from 'drizzle-orm';
import { profiles } from './profiles';
import { organizations, memberships, invitations } from './organizations';
import { competitorProfiles, stores, scrapingRules } from './stores';
import { myProducts, competitorProducts } from './products';
import {
  normalizedProductAliases,
  normalizedProducts,
  productAvailabilityHistory,
  productInsightsCache,
  productMatchingLogs,
  productPriceHistory,
  productSpecifications,
} from './product-intelligence';
import { categories, tags } from './taxonomy';
import { priceSnapshots, scrapeRuns } from './snapshots';
import { productMatches } from './matches';
import { alertRules, notifications } from './alerts';
import { exports_, auditLogs } from './exports-audit';
import { aiExtractionSuggestions, manualScrapingSessions } from './ai';
import { extractionDebugArtifacts, selectorRepairAttempts } from './operations';
import {
  siteDiscoveryCategories,
  siteDiscoveryLogs,
  siteDiscoveryPages,
  siteDiscoveryProducts,
  siteDiscoveryRuns,
} from './discovery';

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  stores: many(stores),
  aiExtractionSuggestions: many(aiExtractionSuggestions),
  manualScrapingSessions: many(manualScrapingSessions),
  siteDiscoveryRuns: many(siteDiscoveryRuns),
  myProducts: many(myProducts),
  competitorProducts: many(competitorProducts),
  categories: many(categories),
  tags: many(tags),
  normalizedProducts: many(normalizedProducts),
  productInsights: many(productInsightsCache),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, { fields: [memberships.orgId], references: [organizations.id] }),
  user: one(profiles, { fields: [memberships.userId], references: [profiles.id] }),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  organization: one(organizations, { fields: [stores.orgId], references: [organizations.id] }),
  rules: one(scrapingRules, { fields: [stores.id], references: [scrapingRules.storeId] }),
  profile: one(competitorProfiles, { fields: [stores.id], references: [competitorProfiles.storeId] }),
  products: many(competitorProducts),
  runs: many(scrapeRuns),
  aiExtractionSuggestions: many(aiExtractionSuggestions),
  manualScrapingSessions: many(manualScrapingSessions),
  discoveryRuns: many(siteDiscoveryRuns),
}));

export const scrapingRulesRelations = relations(scrapingRules, ({ one }) => ({
  store: one(stores, { fields: [scrapingRules.storeId], references: [stores.id] }),
}));

export const competitorProfilesRelations = relations(competitorProfiles, ({ one }) => ({
  store: one(stores, { fields: [competitorProfiles.storeId], references: [stores.id] }),
}));

export const aiExtractionSuggestionsRelations = relations(aiExtractionSuggestions, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiExtractionSuggestions.orgId],
    references: [organizations.id],
  }),
  store: one(stores, { fields: [aiExtractionSuggestions.competitorId], references: [stores.id] }),
}));

export const selectorRepairAttemptsRelations = relations(selectorRepairAttempts, ({ one }) => ({
  organization: one(organizations, {
    fields: [selectorRepairAttempts.orgId],
    references: [organizations.id],
  }),
  store: one(stores, { fields: [selectorRepairAttempts.competitorId], references: [stores.id] }),
  product: one(competitorProducts, {
    fields: [selectorRepairAttempts.productId],
    references: [competitorProducts.id],
  }),
  rules: one(scrapingRules, {
    fields: [selectorRepairAttempts.scrapingRuleId],
    references: [scrapingRules.id],
  }),
  artifact: one(extractionDebugArtifacts, {
    fields: [selectorRepairAttempts.debugArtifactId],
    references: [extractionDebugArtifacts.id],
  }),
  run: one(scrapeRuns, { fields: [selectorRepairAttempts.scrapeRunId], references: [scrapeRuns.id] }),
}));

export const manualScrapingSessionsRelations = relations(manualScrapingSessions, ({ one }) => ({
  organization: one(organizations, {
    fields: [manualScrapingSessions.orgId],
    references: [organizations.id],
  }),
  store: one(stores, { fields: [manualScrapingSessions.competitorId], references: [stores.id] }),
}));

export const siteDiscoveryRunsRelations = relations(siteDiscoveryRuns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [siteDiscoveryRuns.orgId],
    references: [organizations.id],
  }),
  store: one(stores, { fields: [siteDiscoveryRuns.competitorId], references: [stores.id] }),
  pages: many(siteDiscoveryPages),
  categories: many(siteDiscoveryCategories),
  products: many(siteDiscoveryProducts),
  logs: many(siteDiscoveryLogs),
}));

export const siteDiscoveryPagesRelations = relations(siteDiscoveryPages, ({ one }) => ({
  run: one(siteDiscoveryRuns, {
    fields: [siteDiscoveryPages.runId],
    references: [siteDiscoveryRuns.id],
  }),
}));

export const siteDiscoveryCategoriesRelations = relations(siteDiscoveryCategories, ({ one, many }) => ({
  run: one(siteDiscoveryRuns, {
    fields: [siteDiscoveryCategories.runId],
    references: [siteDiscoveryRuns.id],
  }),
  store: one(stores, { fields: [siteDiscoveryCategories.competitorId], references: [stores.id] }),
  products: many(siteDiscoveryProducts),
}));

export const siteDiscoveryProductsRelations = relations(siteDiscoveryProducts, ({ one }) => ({
  run: one(siteDiscoveryRuns, {
    fields: [siteDiscoveryProducts.runId],
    references: [siteDiscoveryRuns.id],
  }),
  store: one(stores, { fields: [siteDiscoveryProducts.competitorId], references: [stores.id] }),
  category: one(siteDiscoveryCategories, {
    fields: [siteDiscoveryProducts.categoryId],
    references: [siteDiscoveryCategories.id],
  }),
}));

export const siteDiscoveryLogsRelations = relations(siteDiscoveryLogs, ({ one }) => ({
  run: one(siteDiscoveryRuns, {
    fields: [siteDiscoveryLogs.runId],
    references: [siteDiscoveryRuns.id],
  }),
}));

export const competitorProductsRelations = relations(competitorProducts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [competitorProducts.orgId],
    references: [organizations.id],
  }),
  store: one(stores, { fields: [competitorProducts.storeId], references: [stores.id] }),
  snapshots: many(priceSnapshots),
  matches: many(productMatches),
}));

export const myProductsRelations = relations(myProducts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [myProducts.orgId],
    references: [organizations.id],
  }),
  category: one(categories, { fields: [myProducts.categoryId], references: [categories.id] }),
  matches: many(productMatches),
}));

export const normalizedProductsRelations = relations(normalizedProducts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [normalizedProducts.orgId],
    references: [organizations.id],
  }),
  category: one(categories, {
    fields: [normalizedProducts.categoryId],
    references: [categories.id],
  }),
  aliases: many(normalizedProductAliases),
  specifications: one(productSpecifications, {
    fields: [normalizedProducts.id],
    references: [productSpecifications.normalizedProductId],
  }),
  priceHistory: many(productPriceHistory),
  availabilityHistory: many(productAvailabilityHistory),
  matchingLogs: many(productMatchingLogs),
}));

export const normalizedProductAliasesRelations = relations(normalizedProductAliases, ({ one }) => ({
  product: one(normalizedProducts, {
    fields: [normalizedProductAliases.normalizedProductId],
    references: [normalizedProducts.id],
  }),
}));

export const productSpecificationsRelations = relations(productSpecifications, ({ one }) => ({
  product: one(normalizedProducts, {
    fields: [productSpecifications.normalizedProductId],
    references: [normalizedProducts.id],
  }),
}));

export const productPriceHistoryRelations = relations(productPriceHistory, ({ one }) => ({
  product: one(normalizedProducts, {
    fields: [productPriceHistory.normalizedProductId],
    references: [normalizedProducts.id],
  }),
}));

export const productAvailabilityHistoryRelations = relations(productAvailabilityHistory, ({ one }) => ({
  product: one(normalizedProducts, {
    fields: [productAvailabilityHistory.normalizedProductId],
    references: [normalizedProducts.id],
  }),
}));

export const productMatchingLogsRelations = relations(productMatchingLogs, ({ one }) => ({
  product: one(normalizedProducts, {
    fields: [productMatchingLogs.normalizedProductId],
    references: [normalizedProducts.id],
  }),
  myProduct: one(myProducts, {
    fields: [productMatchingLogs.myProductId],
    references: [myProducts.id],
  }),
  competitorProduct: one(competitorProducts, {
    fields: [productMatchingLogs.competitorProductId],
    references: [competitorProducts.id],
  }),
}));

export const priceSnapshotsRelations = relations(priceSnapshots, ({ one }) => ({
  product: one(competitorProducts, {
    fields: [priceSnapshots.competitorProductId],
    references: [competitorProducts.id],
  }),
  run: one(scrapeRuns, { fields: [priceSnapshots.scrapeRunId], references: [scrapeRuns.id] }),
}));

export const productMatchesRelations = relations(productMatches, ({ one }) => ({
  myProduct: one(myProducts, {
    fields: [productMatches.myProductId],
    references: [myProducts.id],
  }),
  competitorProduct: one(competitorProducts, {
    fields: [productMatches.competitorProductId],
    references: [competitorProducts.id],
  }),
}));

export const alertRulesRelations = relations(alertRules, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [alertRules.orgId],
    references: [organizations.id],
  }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  rule: one(alertRules, { fields: [notifications.alertRuleId], references: [alertRules.id] }),
  user: one(profiles, { fields: [notifications.userId], references: [profiles.id] }),
}));
