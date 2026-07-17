import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  bigserial,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { profiles } from './profiles';
import {
  automationJobPriorityEnum,
  automationJobStatusEnum,
  automationJobTypeEnum,
  providerResultStatusEnum,
  shipmentStatusEnum,
} from './enums';

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number').notNull(),
    displayName: text('display_name'),
    carrierHint: text('carrier_hint'),
    originCountry: text('origin_country'),
    destinationCountry: text('destination_country'),
    trackingEnabled: boolean('tracking_enabled').default(true).notNull(),
    currentStatus: shipmentStatusEnum('current_status').default('pending').notNull(),
    previousStatus: shipmentStatusEnum('previous_status'),
    statusTitle: text('status_title'),
    statusDescription: text('status_description'),
    lastLocation: text('last_location'),
    lastCarrier: text('last_carrier'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    nextCheckAt: timestamp('next_check_at', { withTimezone: true }).defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    checkIntervalMinutes: integer('check_interval_minutes').default(360).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgTrackingUnique: uniqueIndex('shipments_org_tracking_unique').on(t.orgId, t.trackingNumber),
    orgNextCheckIdx: index('shipments_org_next_check_idx').on(
      t.orgId,
      t.trackingEnabled,
      t.nextCheckAt,
    ),
    orgStatusIdx: index('shipments_org_status_idx').on(t.orgId, t.currentStatus),
  }),
);

export const automationJobs = pgTable(
  'automation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: automationJobTypeEnum('type').notNull(),
    priority: automationJobPriorityEnum('priority').default('normal').notNull(),
    status: automationJobStatusEnum('status').default('queued').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    resultJson: jsonb('result_json').$type<Record<string, unknown>>(),
    progressJson: jsonb('progress_json').$type<Record<string, unknown>>(),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    dedupeKey: text('dedupe_key'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    leaseOwner: text('lease_owner'),
    leaseToken: uuid('lease_token'),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    inputVersion: integer('input_version').default(1).notNull(),
    resultVersion: integer('result_version').default(1).notNull(),
    executorVersion: text('executor_version').default('automation-core-v1').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    claimIdx: index('automation_jobs_claim_idx').on(
      t.status,
      t.scheduledAt,
      t.priority,
      t.createdAt,
    ),
    orgCreatedIdx: index('automation_jobs_org_created_idx').on(t.orgId, t.createdAt),
    leaseIdx: index('automation_jobs_lease_idx').on(t.status, t.leasedUntil),
    dedupeIdx: index('automation_jobs_dedupe_idx').on(t.orgId, t.dedupeKey),
  }),
);

export const automationJobEvents = pgTable(
  'automation_job_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => automationJobs.id, { onDelete: 'cascade' }),
    level: text('level').default('info').notNull(),
    event: text('event').notNull(),
    message: text('message').notNull(),
    progress: integer('progress'),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ jobTimeIdx: index('automation_job_events_job_time_idx').on(t.jobId, t.createdAt) }),
);

export const shipmentEvents = pgTable(
  'shipment_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => automationJobs.id, { onDelete: 'set null' }),
    status: shipmentStatusEnum('status').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    carrier: text('carrier'),
    provider: text('provider'),
    eventAt: timestamp('event_at', { withTimezone: true }),
    eventHash: text('event_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    shipmentTimeIdx: index('shipment_events_shipment_time_idx').on(t.shipmentId, t.eventAt),
    shipmentHashUnique: uniqueIndex('shipment_events_shipment_hash_unique').on(
      t.shipmentId,
      t.eventHash,
    ),
  }),
);

export const shipmentProviderResults = pgTable(
  'shipment_provider_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => automationJobs.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: providerResultStatusEnum('status').notNull(),
    normalizedJson: jsonb('normalized_json').$type<Record<string, unknown>>(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    errorCode: text('error_code'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    jobProviderUnique: uniqueIndex('shipment_provider_results_job_provider_unique').on(
      t.jobId,
      t.provider,
    ),
    shipmentCreatedIdx: index('shipment_provider_results_shipment_created_idx').on(
      t.shipmentId,
      t.createdAt,
    ),
  }),
);

export const automationArtifacts = pgTable('automation_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => automationJobs.id, { onDelete: 'cascade' }),
  provider: text('provider'),
  kind: text('kind').notNull(),
  storageKey: text('storage_key'),
  sanitizedSnapshot: text('sanitized_snapshot'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const providerHealth = pgTable(
  'provider_health',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    state: text('state').default('unknown').notNull(),
    successRate: numeric('success_rate', { precision: 5, scale: 4 }).default('0').notNull(),
    captchaRate: numeric('captcha_rate', { precision: 5, scale: 4 }).default('0').notNull(),
    avgDurationMs: integer('avg_duration_ms'),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    disabledUntil: timestamp('disabled_until', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgProviderUnique: uniqueIndex('provider_health_org_provider_unique').on(t.orgId, t.provider),
  }),
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: text('status').default('pending').notNull(),
    errorSummary: text('error_summary'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgDedupeUnique: uniqueIndex('notification_deliveries_org_dedupe_unique').on(
      t.orgId,
      t.dedupeKey,
    ),
  }),
);

export const shipmentUpdateRequests = pgTable(
  'shipment_update_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
    status: text('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({ pendingIdx: index('shipment_update_requests_pending_idx').on(t.status, t.createdAt) }),
);

export type AutomationJob = typeof automationJobs.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
