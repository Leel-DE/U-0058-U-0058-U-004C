export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'UAH'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const ORG_ROLES = ['owner', 'manager', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const AVAILABILITY = ['in_stock', 'out_of_stock', 'preorder', 'limited', 'unknown'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const SNAPSHOT_STATUS = [
  'ok',
  'parse_failed',
  'blocked',
  'captcha',
  'suspicious',
  'http_error',
  'skipped_robots',
] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUS)[number];

export const SCRAPE_STRATEGY = ['cheerio', 'playwright', 'manual', 'csv_import'] as const;
export type ScrapeStrategy = (typeof SCRAPE_STRATEGY)[number];

export const CRAWL_PRESETS = ['safe', 'balanced', 'fast', 'heavy_discovery'] as const;
export type CrawlPreset = (typeof CRAWL_PRESETS)[number];

export const RUN_STATUS = ['queued', 'running', 'success', 'partial', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export const ALERT_TYPES = [
  'competitor_cheaper_than_me',
  'price_drop_pct',
  'price_rise_pct',
  'back_in_stock',
  'out_of_stock',
  'my_price_above_market_pct',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const NOTIF_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type NotifChannel = (typeof NOTIF_CHANNELS)[number];

export const NOTIF_STATUSES = ['pending', 'sent', 'failed', 'read'] as const;
export type NotifStatus = (typeof NOTIF_STATUSES)[number];

export const MATCH_METHODS = [
  'manual',
  'sku',
  'gtin',
  'title_similarity',
  'brand_model',
] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export const MATCH_STATUSES = ['suggested', 'confirmed', 'rejected'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const STORE_STATUS = ['active', 'paused', 'error'] as const;
export type StoreStatus = (typeof STORE_STATUS)[number];

export const USER_AGENT = 'CompetitorRadarBot/1.0 (+contact@example.com)';
export const DEFAULT_CRAWL_DELAY_SECONDS = 5;
export const MIN_CRAWL_DELAY_SECONDS = 2;
export const DEFAULT_CRAWL_FREQUENCY_MINUTES = 24 * 60;
export const ROBOTS_TXT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const SCRAPER_TIMEOUT_MS = 15_000;
export const PLAYWRIGHT_TIMEOUT_MS = 30_000;

export const MAX_PRICE = 1_000_000;
export const MIN_TITLE_LEN = 3;
export const MAX_TITLE_LEN = 500;
