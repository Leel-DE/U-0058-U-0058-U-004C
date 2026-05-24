import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('categories_org_slug_unique').on(t.orgId, t.slug),
    orgParentIdx: index('categories_org_parent_idx').on(t.orgId, t.parentId),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgNameUnique: uniqueIndex('tags_org_name_unique').on(t.orgId, t.name),
  }),
);

export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
