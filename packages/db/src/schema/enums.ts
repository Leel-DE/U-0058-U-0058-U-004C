import { pgEnum } from 'drizzle-orm/pg-core';

export const orgRoleEnum = pgEnum('org_role', ['owner', 'manager', 'viewer']);
export const storeStatusEnum = pgEnum('store_status', ['active', 'paused', 'error']);
export const availabilityEnum = pgEnum('availability', [
  'in_stock',
  'out_of_stock',
  'preorder',
  'limited',
  'unknown',
]);
export const snapshotStatusEnum = pgEnum('snapshot_status', [
  'ok',
  'parse_failed',
  'blocked',
  'captcha',
  'suspicious',
  'http_error',
  'skipped_robots',
]);
export const scrapeStrategyEnum = pgEnum('scrape_strategy', [
  'cheerio',
  'playwright',
  'manual',
  'csv_import',
]);
export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'running',
  'success',
  'partial',
  'failed',
]);
export const alertTypeEnum = pgEnum('alert_type', [
  'competitor_cheaper_than_me',
  'price_drop_pct',
  'price_rise_pct',
  'back_in_stock',
  'out_of_stock',
  'my_price_above_market_pct',
]);
export const notifChannelEnum = pgEnum('notif_channel', ['in_app', 'email', 'webhook']);
export const notifStatusEnum = pgEnum('notif_status', ['pending', 'sent', 'failed', 'read']);
export const matchMethodEnum = pgEnum('match_method', [
  'manual',
  'sku',
  'gtin',
  'title_similarity',
  'brand_model',
]);
export const matchStatusEnum = pgEnum('match_status', ['suggested', 'confirmed', 'rejected']);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export const exportKindEnum = pgEnum('export_kind', [
  'snapshots_csv',
  'products_csv',
  'matches_csv',
  'analytics_xlsx',
  'product_intelligence_csv',
  'product_intelligence_json',
  'product_history_csv',
]);
export const exportStatusEnum = pgEnum('export_status', [
  'queued',
  'running',
  'ready',
  'failed',
  'expired',
]);

export const automationJobTypeEnum = pgEnum('automation_job_type', [
  'competitor_discovery',
  'competitor_scrape',
  'shipment_tracking',
]);
export const automationJobPriorityEnum = pgEnum('automation_job_priority', [
  'critical',
  'high',
  'normal',
  'low',
]);
export const automationJobStatusEnum = pgEnum('automation_job_status', [
  'queued',
  'running',
  'awaiting_user',
  'succeeded',
  'partial',
  'failed',
  'dead_letter',
  'cancelled',
]);
export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending',
  'info_received',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'unknown',
]);
export const providerResultStatusEnum = pgEnum('provider_result_status', [
  'succeeded',
  'no_data',
  'captcha',
  'blocked',
  'failed',
]);
