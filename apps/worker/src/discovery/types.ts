import type { Availability } from '../types.js';

export type DiscoveryStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'manual_action_required'
  | 'cancelled'
  | 'success'
  | 'partial'
  | 'failed';

export type DiscoveryPageType = 'homepage' | 'category' | 'product' | 'content' | 'captcha' | 'unknown';
export type DiscoveryMode = 'category_scan' | 'detail_enrichment';
export type DiscoverySource = 'sitemap' | 'category_card' | 'product_detail' | 'ai_assisted' | 'heuristic';

export interface DiscoveryOptions {
  runId?: string;
  organizationId?: string;
  competitorId?: string;
  startUrl: string;
  maxPages: number;
  maxProducts: number;
  crawlDepth: number;
  maxPagesPerCategory: number;
  maxScrollIterations: number;
  concurrency: number;
  mode: DiscoveryMode;
  respectRobotsTxt: boolean;
  jsRequired: boolean;
  useAi: boolean;
  useManualCaptcha: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  domainAllowlist: string[];
  userAgent: string;
}

export interface DiscoveryPage {
  url: string;
  normalizedUrl: string;
  canonicalUrl?: string;
  pageType: DiscoveryPageType;
  status: 'queued' | 'crawled' | 'skipped' | 'error';
  httpStatus?: number;
  depth: number;
  parentUrl?: string;
  title?: string;
  h1?: string;
  confidence: number;
  discoveredFrom: string;
  crawledAt?: string;
  error?: string;
}

export interface DiscoveryCategory {
  id: string;
  url: string;
  name: string;
  path?: string;
  breadcrumbs: string[];
  productCountEstimate?: number;
  productsFound: number;
  paginationPagesFound: number;
  confidence: number;
  source: DiscoverySource;
}

export interface DiscoveryProduct {
  id: string;
  url: string;
  normalizedUrl: string;
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  availability?: Availability | 'unknown';
  imageUrl?: string;
  brand?: string;
  sku?: string;
  ean?: string;
  gtin?: string;
  rating?: number;
  shipping?: string;
  categoryPath?: string;
  categoryUrl?: string;
  breadcrumbs: string[];
  sourcePageUrl: string;
  rawCardJson?: Record<string, unknown>;
  rawDetailJson?: Record<string, unknown>;
  confidence: number;
  source: DiscoverySource;
  errors: string[];
}

export interface DiscoveryLog {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface DiscoverySummary {
  totalPagesDiscovered: number;
  pagesCrawled: number;
  categoriesFound: number;
  productsFound: number;
  errors: number;
  durationMs: number;
  averagePrice?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface DiscoveryReport {
  runId: string;
  status: DiscoveryStatus;
  startUrl: string;
  summary: DiscoverySummary;
  pages: DiscoveryPage[];
  categories: DiscoveryCategory[];
  products: DiscoveryProduct[];
  logs: DiscoveryLog[];
  startedAt: string;
  finishedAt?: string;
}

