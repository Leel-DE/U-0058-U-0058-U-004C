export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

export interface AnalyticsFilters {
  range: AnalyticsRange;
  dateFrom: Date | null;
  previousDateFrom: Date | null;
  previousDateTo: Date | null;
  competitor?: string;
  category?: string;
  brand?: string;
  availability?: string;
  discountOnly: boolean;
  inStockOnly: boolean;
  staleOnly: boolean;
  lowConfidenceOnly: boolean;
  reviewedOnly: boolean;
  changesOnly: boolean;
  stockChangesOnly: boolean;
  minPrice?: number;
  maxPrice?: number;
  minVolatility?: number;
  maxVolatility?: number;
}

export interface AnalyticsKpi {
  label: string;
  value: string;
  numericValue: number;
  delta?: number;
  status: 'neutral' | 'good' | 'warning' | 'critical';
  href?: string;
  sparkline: Array<{ date: string; value: number }>;
}

export interface MarketTrendPoint {
  bucket: string;
  averagePrice: number | null;
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  averageDiscount: number;
  drops: number;
  increases: number;
  changes: number;
}

export interface CompetitorAnalyticsRow {
  competitorId: string;
  competitorName: string;
  monitoredProducts: number;
  avgPrice: number | null;
  medianPrice: number | null;
  avgDiscount: number;
  stockRatio: number;
  priceChanges: number;
  priceDrops: number;
  priceIncreases: number;
  stockChanges: number;
  failedScrapes: number;
  lastCrawl: string | null;
  aggressivenessScore: number;
  volatilityScore: number;
  dataQualityScore: number;
}

export interface CategoryAnalyticsRow {
  category: string;
  categoryId: string | null;
  productsCount: number;
  competitorsCount: number;
  avgPrice: number | null;
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgDiscount: number;
  stockRatio: number;
  volatilityScore: number;
  priceChanges: number;
  trend: 'falling' | 'rising' | 'stable' | 'unknown';
}

export interface ProductMovementRow {
  productId: string;
  competitorProductId: string;
  productTitle: string;
  competitorName: string;
  oldPrice: number | null;
  newPrice: number | null;
  currency: string;
  deltaAmount: number | null;
  deltaPct: number | null;
  timestamp: string | null;
  metric?: number;
  href: string;
}

export interface ProductMovements {
  biggestDrops: ProductMovementRow[];
  biggestIncreases: ProductMovementRow[];
  mostVolatile: ProductMovementRow[];
  mostDiscounted: ProductMovementRow[];
  mostFrequentlyChanging: ProductMovementRow[];
  missingPrices: ProductMovementRow[];
  staleProducts: ProductMovementRow[];
}

export interface AvailabilityPoint {
  bucket: string;
  inStock: number;
  outOfStock: number;
  unknown: number;
  newlyUnavailable: number;
  backInStock: number;
}

export interface AvailabilityAnalytics {
  trend: AvailabilityPoint[];
  distribution: Array<{ name: string; value: number }>;
  newlyUnavailable: ProductMovementRow[];
  backInStock: ProductMovementRow[];
  unstableAvailability: ProductMovementRow[];
}

export interface DataQualitySummary {
  missingPriceCount: number;
  missingImageCount: number;
  lowConfidenceProducts: number;
  failedExtractions: number;
  staleProducts: number;
  selectorRepairCount: number;
  captchaManualSessions: number;
  neverSuccessfullyScraped: number;
  extractionSuccessRate: number;
  dataQualityScore: number;
}

export interface DataQualityAnalytics {
  summary: DataQualitySummary;
  confidenceDistribution: Array<{ bucket: string; count: number }>;
  extractionHealthTrend: Array<{ bucket: string; ok: number; failed: number }>;
  scrapeSuccessTimeline: Array<{ bucket: string; successRate: number; failed: number; total: number }>;
  worstProducts: ProductMovementRow[];
  failedExtractions: ProductMovementRow[];
  problematicCompetitors: CompetitorAnalyticsRow[];
}

export interface MarketInsight {
  id: string;
  type: 'price_drop_trend' | 'stock_instability' | 'discount_spike' | 'stale_monitoring' | 'aggressive_competitor' | 'unusual_activity';
  title: string;
  description: string;
  severity: 'success' | 'warning' | 'critical' | 'info';
  metric: string;
  href?: string;
}
