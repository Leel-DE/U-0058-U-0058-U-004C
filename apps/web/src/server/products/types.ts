export type ProductEntityType = 'normalized' | 'raw_competitor';
export type ProductTrend = 'falling' | 'rising' | 'stable' | 'volatile' | 'unknown';
export type ProductStockStatus = 'in_stock' | 'out_of_stock' | 'mixed' | 'unknown';
export type ProductGroupBy = 'none' | 'brand' | 'category' | 'competitor' | 'stock' | 'volatility' | 'discount' | 'price_range';

export interface ProductIntelligenceFilters {
  search?: string;
  category?: string;
  brand?: string;
  competitor?: string;
  availability?: string;
  stock?: string;
  discount?: string;
  advanced?: string;
  groupBy: ProductGroupBy;
  sort: string;
  page: number;
  pageSize: number;
  minPrice?: number;
  maxPrice?: number;
  specs: Record<string, string>;
}

export interface ProductSparkPoint {
  date: string;
  price: number | null;
}

export interface ProductStoreMember {
  competitorProductId: string;
  storeId: string;
  storeName: string;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number | null;
  oldPrice: number | null;
  currency: string;
  availability: string | null;
  lastScrapedAt: string | null;
}

export interface ProductIntelligenceRow {
  id: string;
  entityType: ProductEntityType;
  canonicalTitle: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  competitorsCount: number;
  currentMinPrice: number | null;
  currentAvgPrice: number | null;
  currentMaxPrice: number | null;
  currency: string;
  volatility: number;
  stockStatus: ProductStockStatus;
  activeDiscounts: number;
  lastChange: string | null;
  marketTrend: ProductTrend;
  confidence: number;
  discoveredAt: string | null;
  updatedAt: string | null;
  matched: boolean;
  duplicateRisk: boolean;
  stale: boolean;
  missingPrice: boolean;
  sparkline: ProductSparkPoint[];
  members: ProductStoreMember[];
  clusterKey: string;
}

export interface ProductCluster {
  key: string;
  representative: ProductIntelligenceRow;
  rows: ProductIntelligenceRow[];
  members: ProductStoreMember[];
  storeCount: number;
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  cheapestStoreName: string | null;
  highestStoreName: string | null;
  savingsPct: number | null;
  currency: string;
  inStockStores: number;
  outOfStockStores: number;
  lastChange: string | null;
}

export interface ProductGroupSummary {
  key: string;
  label: string;
  count: number;
  avgPrice: number | null;
  volatility: number;
}

export interface ProductIntelligenceList {
  rows: ProductIntelligenceRow[];
  clusters: ProductCluster[];
  groups: ProductGroupSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductFilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface ProductFilterOptions {
  brands: ProductFilterOption[];
  categories: ProductFilterOption[];
  competitors: ProductFilterOption[];
}

export interface ProductCompetitorComparison {
  competitorProductId: string;
  competitorId: string;
  competitorName: string;
  competitorDomain: string | null;
  title: string;
  url: string;
  currentPrice: number | null;
  oldPrice: number | null;
  currency: string;
  discountPct: number | null;
  availability: string | null;
  shipping: string | null;
  rating: number | null;
  lastUpdate: string | null;
  confidence: number | null;
  source: string | null;
  sku: string | null;
  gtin: string | null;
  imageUrl: string | null;
  pricePositionPct: number | null;
}

export interface ProductMissingStore {
  storeId: string;
  storeName: string;
  storeDomain: string | null;
  currency: string | null;
  status: string | null;
  searchUrl: string;
  scrapedCount: number;
}

export interface CrossStoreCandidate {
  competitorProductId: string;
  storeId: string;
  storeName: string;
  storeDomain: string | null;
  title: string;
  url: string;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  gtin: string | null;
  price: number | null;
  oldPrice: number | null;
  currency: string | null;
  availability: string | null;
  lastScrapedAt: string | null;
  similarity: number;
  matchMethod: 'gtin' | 'sku' | 'brand_model' | 'title_similarity';
  reasons: string[];
}

export interface ProductIdentifiers {
  sku: string | null;
  gtin: string | null;
  brand: string | null;
  competitorSkus: string[];
  competitorGtins: string[];
  competitorTitles: string[];
}

export interface ProductPriceStats {
  median: number | null;
  best30d: number | null;
  worst30d: number | null;
  best90d: number | null;
  worst90d: number | null;
  cheapestStreakDays: number | null;
}

export interface ProductDetailPoint {
  date: string;
  competitorProductId: string;
  competitorName: string;
  price: number | null;
  oldPrice: number | null;
  availability: string | null;
  discountPct: number | null;
  confidence: number | null;
}

export interface ProductSpreadPoint {
  date: string;
  min: number | null;
  avg: number | null;
  max: number | null;
}

export interface ProductEvent {
  id: string;
  type: 'price_changed' | 'stock_changed' | 'snapshot' | 'selector_issue' | 'discovery' | 'match';
  label: string;
  timestamp: string | null;
  status: 'success' | 'warning' | 'critical' | 'neutral';
}

export interface ProductSpecs {
  brand?: string;
  model?: string;
  year?: number;
  motor?: string;
  battery?: string;
  batteryWh?: number;
  drivetrain?: string;
  brakes?: string;
  wheelSize?: string;
  frameMaterial?: string;
  weightKg?: number;
  travelMm?: number;
  color?: string;
  size?: string;
  bikeType?: string;
}

export interface ProductDetail {
  id: string;
  entityType: ProductEntityType;
  canonicalTitle: string;
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  specs: ProductSpecs;
  confidence: number;
  competitorsCount: number;
  lastUpdated: string | null;
  url: string | null;
  myPrice: number | null;
  identifiers: ProductIdentifiers;
  overview: {
    cheapestCompetitor: string | null;
    highestPrice: number | null;
    minPrice: number | null;
    averagePrice: number | null;
    currentDiscountPct: number | null;
    stockRatio: number;
    volatilityScore: number;
    marketTrend: ProductTrend;
    competitorSpread: number | null;
    spreadPct: number | null;
    inStockCount: number;
    outOfStockCount: number;
    currency: string;
  };
  priceStats: ProductPriceStats;
  competitors: ProductCompetitorComparison[];
  missingFromStores: ProductMissingStore[];
  priceTimeline: ProductDetailPoint[];
  spreadTimeline: ProductSpreadPoint[];
  events: ProductEvent[];
}

export interface ProductInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  metric: string;
  href?: string;
}

export interface ProductAnalyticsPageData {
  title: string;
  subtitle: string;
  rows: ProductIntelligenceRow[];
  summary: ProductGroupSummary[];
}
