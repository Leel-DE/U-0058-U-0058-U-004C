import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { exportKindEnum, exportStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const exports_ = pgTable(
  'exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: exportKindEnum('kind').notNull(),
    params: jsonb('params').default({}).notNull(),
    status: exportStatusEnum('status').default('queued').notNull(),
    storageKey: text('storage_key'),
    rowCount: text('row_count'),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    orgCreatedIdx: index('exports_org_created_idx').on(t.orgId, t.createdAt),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('audit_logs_org_created_idx').on(t.orgId, t.createdAt),
    entityIdx: index('audit_logs_entity_idx').on(t.entity, t.entityId),
  }),
);

export type ExportRow = typeof exports_.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
