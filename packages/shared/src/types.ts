import type {
  AlertType,
  Availability,
  Currency,
  CrawlPreset,
  NotifChannel,
  ScrapeStrategy,
  SnapshotStatus,
} from './constants.js';

/** Result-style discriminated union used across server actions. */
export type Result<T, E = ActionError> = { ok: true; data: T } | { ok: false; error: E };

export type ActionErrorCode =
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ExtractedProduct {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: Currency;
  availability?: Availability;
  image?: string;
  sku?: string;
  category?: string;
  shipping?: string;
  rating?: number;
}

export interface ScrapeRequest {
  url: string;
  strategy: ScrapeStrategy | 'auto';
  rules: ScrapingRulesPayload;
  respectRobots: boolean;
  userAgent: string;
  timeoutMs?: number;
}

export interface ScrapingRulesPayload {
  titleSelector?: string | null;
  priceSelector?: string | null;
  oldPriceSelector?: string | null;
  availabilitySelector?: string | null;
  imageSelector?: string | null;
  brandSelector?: string | null;
  skuSelector?: string | null;
  breadcrumbsSelector?: string | null;
  productCardSelector?: string | null;
  cardTitleSelector?: string | null;
  cardPriceSelector?: string | null;
  cardOldPriceSelector?: string | null;
  cardImageSelector?: string | null;
  cardLinkSelector?: string | null;
  cardAvailabilitySelector?: string | null;
  paginationNextSelector?: string | null;
  loadMoreSelector?: string | null;
  shippingSelector?: string | null;
  ratingSelector?: string | null;
  priceRegex?: string | null;
  useJsonLd: boolean;
  useOpenGraph: boolean;
}

export type StoreFramework =
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'shopware'
  | 'nextjs'
  | 'nuxt'
  | 'tilda'
  | 'custom';

export type RenderingStrategy = 'static_html' | 'hybrid' | 'js_heavy' | 'spa';
export type StoreScrapingMode = 'cheerio' | 'playwright_fallback' | 'playwright_primary' | 'hybrid';
export type StoreDifficulty = 'low' | 'medium' | 'high';

export interface StoreAnalysisResult {
  ok?: boolean;
  store: {
    name: string;
    domain: string;
    homepageUrl: string;
    countryCode: string;
    currency: Currency;
    language?: string;
  };
  framework: {
    framework: StoreFramework;
    label: string;
    confidence: number;
    signals: string[];
  };
  renderingStrategy: {
    strategy: RenderingStrategy;
    scrapingMode: StoreScrapingMode;
    hydration: 'none' | 'partial' | 'heavy';
    confidence: number;
    signals: string[];
    explanation: string;
  };
  scrapingMode: StoreScrapingMode;
  selectors: {
    productSelectors: Partial<ScrapingRulesPayload>;
    categorySelectors: Partial<ScrapingRulesPayload>;
  };
  previews: {
    product?: {
      title?: string;
      price?: number;
      oldPrice?: number;
      currency?: string;
      availability?: string;
      image?: string;
      brand?: string;
      sku?: string;
      breadcrumbs?: string[];
      source?: string;
    };
    category?: {
      cardCount: number;
      cards: Array<{
        title?: string;
        price?: number;
        oldPrice?: number;
        currency?: string;
        availability?: string;
        image?: string;
        link?: string;
      }>;
      paginationNext?: string;
      loadMore?: string;
    };
  };
  validation?: unknown;
  examples: {
    productPageUrl?: string;
    categoryPageUrl?: string;
    listingPageUrls: string[];
    productPageUrls: string[];
    sitemapUrls: string[];
  };
  scrapingProfile: {
    crawlDifficulty: StoreDifficulty;
    antiBotRisk: StoreDifficulty;
    recommendedMode: StoreScrapingMode;
    recommendedDelaySeconds: number;
    expectedScrapeStability: StoreDifficulty;
    crawlPreset: CrawlPreset;
    reasons: string[];
  };
  warnings: string[];
  confidence: number;
  recommendedSettings: {
    crawlPreset: CrawlPreset;
    crawlFrequencyMinutes: number;
    crawlDelaySeconds: number;
    respectRobots: boolean;
    jsRequired: boolean;
    useManualCaptcha: boolean;
    useAi: boolean;
    discoveryPreset: 'quick' | 'normal' | 'deep' | 'full';
    discoveryDefaultsJson: Record<string, unknown>;
  };
  logs: Array<{ level: 'info' | 'warn'; message: string; context?: Record<string, unknown> }>;
  meta?: { durationMs?: number; aiEnabled?: boolean };
}

export type ScrapeSourcePath = 'json-ld' | 'og' | 'selector' | 'heuristic' | 'mixed';

export type ScrapeResponse =
  | {
      ok: true;
      data: ExtractedProduct;
      meta: {
        strategy: 'cheerio' | 'playwright';
        httpStatus: number;
        durationMs: number;
        robotsAllowed: boolean;
        sourcePath: ScrapeSourcePath;
        confidence: number;
        fieldConfidence?: Partial<Record<keyof ExtractedProduct, number>>;
      };
      raw?: { htmlSnippet?: string; screenshotBase64?: string };
    }
  | {
      ok: false;
      errorCode: SnapshotStatus;
      message: string;
      meta: {
        strategy: 'cheerio' | 'playwright';
        httpStatus?: number;
        durationMs: number;
        robotsAllowed?: boolean;
      };
      raw?: { htmlSnippet?: string; screenshotBase64?: string };
    };

export interface AlertParams {
  pricePct?: number;
  thresholdPct?: number;
}

export interface AlertScope {
  myProductId?: string;
  competitorProductId?: string;
  storeId?: string;
}

export interface AlertRulePayload {
  name: string;
  type: AlertType;
  params: AlertParams;
  scope: AlertScope;
  channels: NotifChannel[];
}
