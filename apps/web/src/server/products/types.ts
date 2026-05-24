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
  overview: {
    cheapestCompetitor: string | null;
    highestPrice: number | null;
    averagePrice: number | null;
    currentDiscountPct: number | null;
    stockRatio: number;
    volatilityScore: number;
    marketTrend: ProductTrend;
    competitorSpread: number | null;
    currency: string;
  };
  competitors: ProductCompetitorComparison[];
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
