import type {
  AlertType,
  Availability,
  Currency,
  NotifChannel,
  ScrapeStrategy,
  SnapshotStatus,
} from './constants';

/** Result-style discriminated union used across server actions. */
export type Result<T, E = ActionError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

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
  shippingSelector?: string | null;
  ratingSelector?: string | null;
  priceRegex?: string | null;
  useJsonLd: boolean;
  useOpenGraph: boolean;
}

export type ScrapeSourcePath = 'json-ld' | 'og' | 'selector' | 'mixed';

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
      };
      raw?: { htmlSnippet?: string };
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
