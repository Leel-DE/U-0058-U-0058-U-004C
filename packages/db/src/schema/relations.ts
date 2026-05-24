import { relations } from 'drizzle-orm';
import { profiles } from './profiles';
import { organizations, memberships, invitations } from './organizations';
import { stores, scrapingRules } from './stores';
import { myProducts, competitorProducts } from './products';
import { categories, tags } from './taxonomy';
import { priceSnapshots, scrapeRuns } from './snapshots';
import { productMatches } from './matches';
import { alertRules, notifications } from './alerts';
import { exports_, auditLogs } from './exports-audit';

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  stores: many(stores),
  myProducts: many(myProducts),
  competitorProducts: many(competitorProducts),
  categories: many(categories),
  tags: many(tags),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, { fields: [memberships.orgId], references: [organizations.id] }),
  user: one(profiles, { fields: [memberships.userId], references: [profiles.id] }),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  organization: one(organizations, { fields: [stores.orgId], references: [organizations.id] }),
  rules: one(scrapingRules, { fields: [stores.id], references: [scrapingRules.storeId] }),
  products: many(competitorProducts),
  runs: many(scrapeRuns),
}));

export const scrapingRulesRelations = relations(scrapingRules, ({ one }) => ({
  store: one(stores, { fields: [scrapingRules.storeId], references: [stores.id] }),
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
