export type DashboardRange = 'today' | '7d' | '30d';

export interface DashboardFilters {
  range: DashboardRange;
  competitorId?: string;
  categoryId?: string;
  activeOnly: boolean;
  failedOnly: boolean;
  dateFrom: string;
  previousDateFrom: string;
  previousDateTo: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  numericValue: number;
  delta?: number;
  status: 'neutral' | 'good' | 'warning' | 'critical';
  href?: string;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface MonitoringHealth {
  status: HealthStatus;
  scrapingSuccessRate: number;
  failedRuns24h: number;
  averageCrawlDurationMs: number;
  brokenSelectorsCount: number;
  manualSessionsCount: number;
  staleProductsCount: number;
  lastWorkerHeartbeat: string | null;
  reasons: string[];
}

export interface PriceMovementPoint {
  bucket: string;
  drops: number;
  increases: number;
}

export interface PriceMovementRow {
  productId: string;
  productTitle: string;
  competitorId: string;
  competitorName: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  deltaAmount: number;
  deltaPct: number;
  capturedAt: string;
}

export interface PriceMovements {
  timeline: PriceMovementPoint[];
  drops: PriceMovementRow[];
  increases: PriceMovementRow[];
}

export interface CompetitorActivityRow {
  competitorId: string;
  competitorName: string;
  productsMonitored: number;
  changesToday: number;
  averageDiscountPct: number;
  stockChanges: number;
  failedRuns: number;
  lastCrawl: string | null;
  status: string;
}

export type AttentionIssueType =
  | 'price_drop'
  | 'price_increase'
  | 'out_of_stock'
  | 'back_in_stock'
  | 'stale_data'
  | 'extraction_failed'
  | 'selector_broken'
  | 'captcha_required'
  | 'missing_price'
  | 'duplicate_product';

export interface AttentionProduct {
  productId: string;
  productTitle: string;
  competitorId: string;
  competitorName: string;
  issueType: AttentionIssueType;
  currentPrice: number | null;
  previousPrice: number | null;
  currency: string;
  availability: string | null;
  confidence: number | null;
  lastChecked: string | null;
  href: string;
}

export interface AvailabilityOverview {
  inStock: number;
  outOfStock: number;
  unknown: number;
  backInStockToday: number;
  newlyUnavailableToday: number;
  distribution: Array<{ name: string; value: number }>;
}

export interface RecentEvent {
  id: string;
  type:
    | 'price_changed'
    | 'product_discovered'
    | 'competitor_crawl_completed'
    | 'alert_triggered'
    | 'captcha_required'
    | 'scrape_failed'
    | 'export_completed';
  entity: string;
  timestamp: string;
  status: 'success' | 'warning' | 'critical' | 'neutral';
  href?: string;
}

export interface DataFreshness {
  total: number;
  fresh: number;
  stale: number;
  veryStale: number;
  neverChecked: number;
  freshPct: number;
}
