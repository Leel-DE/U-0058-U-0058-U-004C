import {
  pgTable,
  uuid,
  timestamp,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { matchMethodEnum, matchStatusEnum } from './enums';
import { organizations } from './organizations';
import { myProducts, competitorProducts } from './products';
import { profiles } from './profiles';

export const productMatches = pgTable(
  'product_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    myProductId: uuid('my_product_id')
      .notNull()
      .references(() => myProducts.id, { onDelete: 'cascade' }),
    competitorProductId: uuid('competitor_product_id')
      .notNull()
      .references(() => competitorProducts.id, { onDelete: 'cascade' }),
    method: matchMethodEnum('method').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    status: matchStatusEnum('status').default('suggested').notNull(),
    decidedBy: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqPair: uniqueIndex('product_matches_pair_unique').on(t.myProductId, t.competitorProductId),
    orgStatusIdx: index('product_matches_org_status_idx').on(t.orgId, t.status),
    competitorProductIdx: index('product_matches_competitor_product_idx').on(t.competitorProductId),
  }),
);

export type ProductMatch = typeof productMatches.$inferSelect;
