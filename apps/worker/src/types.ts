export interface ScrapingRules {
  titleSelector?: string | null;
  priceSelector?: string | null;
  oldPriceSelector?: string | null;
  availabilitySelector?: string | null;
  imageSelector?: string | null;
  skuSelector?: string | null;
  categorySelector?: string | null;
  shippingSelector?: string | null;
  ratingSelector?: string | null;
  priceRegex?: string | null;
  useJsonLd: boolean;
  useOpenGraph: boolean;
}

export type SourcePath = 'json-ld' | 'og' | 'selector' | 'heuristic' | 'mixed';

export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'limited' | 'unknown';

export interface Extracted {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  availability?: Availability;
  image?: string;
  sku?: string;
  category?: string;
  shipping?: string;
  rating?: number;
}

export interface ExtractedWithSource extends Extracted {
  sourcePath: SourcePath;
  confidence: number;
  fieldConfidence?: Partial<Record<keyof Extracted, number>>;
}

export type ErrorCode =
  | 'parse_failed'
  | 'blocked'
  | 'captcha'
  | 'suspicious'
  | 'http_error'
  | 'skipped_robots';

export interface FetchResult {
  status: number;
  html: string;
  screenshotBase64?: string;
  finalUrl: string;
  durationMs: number;
  strategy: 'cheerio' | 'playwright';
}
