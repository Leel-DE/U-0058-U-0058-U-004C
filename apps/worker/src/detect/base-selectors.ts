import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { cleanDom } from '../ai/cleaners/clean-dom.js';
import type { AIProvider } from '../ai/providers/index.js';
import type { CategorySuggestion } from '../ai/schemas/category-suggestion.js';
import type { SelectorSuggestion } from '../ai/schemas/selector-suggestion.js';
import { detectProductCards } from '../discovery/product-card-detector.js';
import { extractStructuredProducts } from '../discovery/structured-data-extractor.js';
import type { Availability } from '../types.js';
import { detectAvailability, detectCurrency, normalizeAvailability, parsePrice } from '../util/normalize.js';

type DomNode = AnyNode;

export interface BaseProductSelectors {
  titleSelector?: string | null;
  priceSelector?: string | null;
  oldPriceSelector?: string | null;
  availabilitySelector?: string | null;
  imageSelector?: string | null;
  brandSelector?: string | null;
  skuSelector?: string | null;
  breadcrumbsSelector?: string | null;
}

export interface BaseCategorySelectors {
  productCardSelector?: string | null;
  cardTitleSelector?: string | null;
  cardPriceSelector?: string | null;
  cardOldPriceSelector?: string | null;
  cardImageSelector?: string | null;
  cardLinkSelector?: string | null;
  cardAvailabilitySelector?: string | null;
  paginationNextSelector?: string | null;
  loadMoreSelector?: string | null;
}

export interface ProductPreview {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  availability?: Availability;
  image?: string;
  brand?: string;
  sku?: string;
  breadcrumbs?: string[];
  source?: string;
}

export interface CategoryPreviewCard {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  availability?: Availability;
  image?: string;
  link?: string;
}

export interface CategoryPreview {
  cardCount: number;
  cards: CategoryPreviewCard[];
  paginationNext?: string;
  loadMore?: string;
}

export interface SelectorFieldValidation {
  selector: string;
  count: number;
  valid: boolean;
  reason?: string;
  sample?: string;
}

export interface ProductBaseValidation {
  ok: boolean;
  confidence: number;
  fields: Partial<Record<keyof BaseProductSelectors, SelectorFieldValidation>>;
  extracted: ProductPreview;
}

export interface CategoryBaseValidation {
  ok: boolean;
  confidence: number;
  fields: Partial<Record<keyof BaseCategorySelectors, SelectorFieldValidation>>;
  extracted: CategoryPreview;
}

export interface BaseSelectorDetectionResult {
  productSelectors: BaseProductSelectors;
  categorySelectors: BaseCategorySelectors;
  preview: {
    product?: ProductPreview;
    category?: CategoryPreview;
  };
  confidence: {
    overall: number;
    product: number;
    category: number;
  };
  validation: {
    product?: ProductBaseValidation;
    category?: CategoryBaseValidation;
  };
  warnings: string[];
  logs: Array<{ level: 'info' | 'warn'; message: string; context?: Record<string, unknown> }>;
}

export interface DetectionPage {
  url: string;
  html: string;
}

export interface BaseSelectorDetectionInput {
  homepageUrl: string;
  productPage?: DetectionPage;
  categoryPage?: DetectionPage;
  useAi: boolean;
  aiProvider?: AIProvider | null;
}

interface FieldCandidate {
  selector: string;
  score: number;
  count: number;
  sample?: string;
  value?: string;
  parsed?: unknown;
  source: string;
}

const BAD_SELECTOR_PATTERNS = [
  /nth-child/i,
  /nth-of-type/i,
  /[a-z0-9]{8,}__[a-z0-9_-]+/i,
  /\.[a-z]?[0-9a-f]{7,}/i,
  />\s*div\s*>\s*div\s*>\s*div/i,
];

const PRODUCT_TITLE_SELECTORS = [
  '[itemprop="name"]',
  'meta[property="og:title"]',
  'meta[name="twitter:title"]',
  '[data-testid*="title" i]',
  '[data-test*="title" i]',
  '[data-testid*="name" i]',
  '[data-test*="name" i]',
  '.js-product-name',
  '.t750__title',
  '.t-store__prod-popup__name',
  'h1',
  '.product-title',
  '.product-name',
  '.product-detail-title',
  '.pdp-title',
  '.artikel-name',
  '.produkt-name',
  '[class*="product-title" i]',
  '[class*="product-name" i]',
  '[class*="pdp-title" i]',
  '[class*="artikel-name" i]',
  '[class*="produkt-name" i]',
];

const PRODUCT_PRICE_SELECTORS = [
  '[itemprop="price"]',
  'meta[property="product:price:amount"]',
  'meta[property="og:price:amount"]',
  '[data-price]',
  '[data-testid*="price" i]',
  '[data-test*="price" i]',
  '.js-store-prod-price',
  '.js-store-prod-price-val',
  '.js-product-price',
  '.t750__price',
  '.t750__price-value',
  '.price',
  '.product-price',
  '.current-price',
  '.sale-price',
  '.regular-price',
  '.amount',
  '.money',
  '.preis',
  '.produkt-preis',
  '[class*="current-price" i]',
  '[class*="sale-price" i]',
  '[class*="product-price" i]',
  '[class*="produkt-preis" i]',
  '[class*="preis" i]',
];

const PRODUCT_OLD_PRICE_SELECTORS = [
  '.old-price',
  '.js-store-prod-price-old',
  '.js-store-prod-price-old-val',
  '.t750__price_old',
  '.was-price',
  '.regular-price',
  '.strike',
  '.uvp',
  '.rrp',
  '.list-price',
  'del',
  's',
  '[class*="old-price" i]',
  '[class*="was-price" i]',
  '[class*="regular-price" i]',
  '[class*="strike" i]',
  '[class*="uvp" i]',
  '[class*="rrp" i]',
  '[class*="list-price" i]',
];

const PRODUCT_AVAILABILITY_SELECTORS = [
  '[itemprop="availability"]',
  'meta[property="product:availability"]',
  '[data-testid*="stock" i]',
  '[data-test*="stock" i]',
  '[data-testid*="availability" i]',
  '[data-test*="availability" i]',
  '.availability',
  '.stock',
  '.inventory',
  '.lieferbar',
  '.lieferstatus',
  '.availability-status',
  '[class*="availability" i]',
  '[class*="stock" i]',
  '[class*="inventory" i]',
  '[class*="lieferstatus" i]',
  '[class*="lieferbar" i]',
];

const PRODUCT_IMAGE_SELECTORS = [
  '[itemprop="image"]',
  'img[itemprop="image"]',
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  '.product-image img',
  '.gallery img',
  '.pdp-image img',
  '.product-gallery img',
  '[data-testid*="image" i] img',
  '[data-test*="image" i] img',
  '.js-product-img',
  '[data-original]',
  '[class*="product-image" i] img',
  '[class*="gallery" i] img',
  'main img',
];

const PRODUCT_BRAND_SELECTORS = [
  '[itemprop="brand"]',
  '[data-brand]',
  '[data-testid*="brand" i]',
  '[data-test*="brand" i]',
  '.brand',
  '.marke',
  '[class*="brand" i]',
  '[class*="marke" i]',
];

const PRODUCT_SKU_SELECTORS = [
  '[itemprop="sku"]',
  '.js-product-sku',
  '.js-store-prod-sku',
  '[data-sku]',
  '[data-product-sku]',
  '[data-article-id]',
  '[data-testid*="sku" i]',
  '[data-test*="sku" i]',
  '.sku',
  '.artikelnummer',
  '.article-number',
  '[class*="sku" i]',
  '[class*="artikelnummer" i]',
  '[class*="article-number" i]',
];

const PRODUCT_BREADCRUMB_SELECTORS = [
  '[itemtype*="BreadcrumbList"]',
  'nav[aria-label*="breadcrumb" i]',
  '[aria-label*="breadcrumb" i]',
  '.breadcrumbs',
  '.breadcrumb',
  '[class*="breadcrumb" i]',
];

const CATEGORY_CARD_SELECTORS = [
  '.product-card',
  '.js-store-product_single',
  '.js-store-product',
  '.js-product[data-product-gen-uid]',
  '[data-product-gen-uid]',
  '.product-item',
  '.product-tile',
  '.product-box',
  '.product-grid-item',
  '.artikel-card',
  '.produkt-card',
  '.product-miniature',
  '.woocommerce-loop-product',
  '[itemtype*="Product"]',
  '[data-product-id]',
  '[data-sku]',
  '[data-testid*="product" i]',
  '[data-test*="product" i]',
  '[class*="product-card" i]',
  '[class*="product-item" i]',
  '[class*="product-tile" i]',
  '[class*="artikel" i]',
  '[class*="produkt" i]',
  'article',
];

const CARD_TITLE_SELECTORS = [
  '[itemprop="name"]',
  '[data-testid*="title" i]',
  '[data-test*="title" i]',
  '[data-testid*="name" i]',
  '[data-test*="name" i]',
  '.js-product-name',
  '.t750__title',
  '.t-store__prod-popup__name',
  'h2',
  'h3',
  '[class*="title" i]',
  '[class*="name" i]',
  'a[title]',
  'img[alt]',
];

const CARD_PRICE_SELECTORS = [
  '[itemprop="price"]',
  '[data-price]',
  '[data-testid*="price-current" i]',
  '[data-testid*="current-price" i]',
  '[data-testid*="price" i]',
  '[data-test*="price" i]',
  '.js-store-prod-price',
  '.js-store-prod-price-val',
  '.js-product-price',
  '.t750__price',
  '.t750__price-value',
  '[class*="current-price" i]',
  '[class*="sale-price" i]',
  '[class*="price--current" i]',
  '[class*="price--sale" i]',
  '[class*="produkt-preis" i]',
  '[class*="preis" i]',
  '[class*="price" i]',
  '.amount',
  '.money',
];

const CARD_OLD_PRICE_SELECTORS = [
  '[class*="old-price" i]',
  '.js-store-prod-price-old',
  '.js-store-prod-price-old-val',
  '.t750__price_old',
  '[class*="was-price" i]',
  '[class*="regular-price" i]',
  '[class*="strike" i]',
  '[class*="uvp" i]',
  '[class*="rrp" i]',
  '[class*="list-price" i]',
  'del',
  's',
];

const CARD_IMAGE_SELECTORS = [
  'img[itemprop="image"]',
  '[itemprop="image"]',
  'img[data-src]',
  'img[data-original]',
  'img[data-lazy-src]',
  'img[srcset]',
  '.js-product-img',
  '[data-original]',
  'meta[content*=".jpg"]',
  'meta[content*=".png"]',
  'meta[content*=".webp"]',
  'img',
];

const CARD_LINK_SELECTORS = [
  'a[itemprop="url"][href]',
  '[data-tooltip-hook]',
  'a[data-testid*="product" i][href]',
  'a[data-test*="product" i][href]',
  'a[class*="product" i][href]',
  'a[href]',
];

const CARD_AVAILABILITY_SELECTORS = [
  '[itemprop="availability"]',
  '[data-testid*="stock" i]',
  '[data-test*="stock" i]',
  '[data-testid*="availability" i]',
  '[data-test*="availability" i]',
  '[class*="availability" i]',
  '[class*="stock" i]',
  '[class*="lieferstatus" i]',
  '[class*="lieferbar" i]',
];

const PAGINATION_NEXT_SELECTORS = [
  'a[rel="next"]',
  'link[rel="next"]',
  'a[aria-label*="next" i]',
  'a[aria-label*="weiter" i]',
  'a[aria-label*="n\\00e4chste" i]',
  '.pagination a.next',
  '.pagination-next',
  'a.next',
  '[class*="pagination" i] a[class*="next" i]',
];

const LOAD_MORE_SELECTORS = [
  'button[data-testid*="load" i]',
  'button[data-test*="load" i]',
  'a[data-testid*="load" i]',
  'a[data-test*="load" i]',
  'button[class*="load-more" i]',
  'a[class*="load-more" i]',
  'button[class*="show-more" i]',
  'a[class*="show-more" i]',
  '[class*="load-more" i]',
  '[class*="mehr-laden" i]',
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round2(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function validateCssSelector(selector: string): string | undefined {
  if (!selector.trim()) return 'empty selector';
  if (selector.length > 500) return 'selector too long';
  if (BAD_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector))) return 'selector looks unstable';
  return undefined;
}

function quoteAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function firstAttr(el: Cheerio<DomNode>, attrs: string[]): string | undefined {
  for (const attr of attrs) {
    const value = el.attr(attr)?.trim();
    if (!value) continue;
    if (attr === 'srcset' || attr.endsWith('srcset')) {
      const first = value.split(',')[0]?.trim().split(/\s+/)[0];
      if (first) return first;
      continue;
    }
    return value;
  }
  return undefined;
}

function textValue(el: Cheerio<DomNode>): string | undefined {
  const value =
    el.attr('content') ??
    el.attr('value') ??
    el.attr('data-price') ??
    el.attr('data-sku') ??
    el.attr('data-product-sku') ??
    el.attr('data-brand') ??
    el.attr('aria-label') ??
    el.attr('title') ??
    el.attr('alt') ??
    el.attr('href') ??
    el.text();
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function resolveHttpUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  if (/^(?:data|javascript|mailto|tel):/i.test(raw)) return undefined;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function imageValue(el: Cheerio<DomNode>, baseUrl: string): string | undefined {
  const raw = firstAttr(el, [
    'content',
    'data-srcset',
    'data-src',
    'data-original',
    'data-lazy-src',
    'data-image',
    'srcset',
    'src',
  ]);
  return resolveHttpUrl(raw, baseUrl);
}

function linkValue(el: Cheerio<DomNode>, baseUrl: string): string | undefined {
  const raw = firstAttr(el, ['href', 'data-href', 'data-product-url']);
  const url = resolveHttpUrl(raw, baseUrl);
  if (!url) return undefined;
  if (/\/(?:cart|checkout|login|signin|register|account|wishlist|compare|search)(?:\/|$|\?)/i.test(url)) {
    return undefined;
  }
  return url;
}

function breadcrumbValue(el: Cheerio<DomNode>): string[] | undefined {
  const items = el
    .find('[itemprop="name"], a, li, span')
    .toArray()
    .map((node) => cheerio.load(node).root().text().replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 0 && item.length <= 120);
  const deduped = unique(items);
  if (deduped.length > 1) return deduped;
  const text = el.text().replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  const split = text
    .split(/\s*(?:>|\/|\u203a|\u00bb)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  return split.length > 1 ? split : [text];
}

function sampleForField($: CheerioAPI, selector: string, field: string, baseUrl: string): string | undefined {
  const el = $(selector).first();
  if (!el.length) return undefined;
  if (field.toLowerCase().includes('image')) return imageValue(el, baseUrl);
  if (field.toLowerCase().includes('link') || field === 'paginationNextSelector') return linkValue(el, baseUrl);
  return textValue(el)?.slice(0, 300);
}

function selectorBonus(selector: string): number {
  let score = 0;
  if (selector.includes('itemprop')) score += 25;
  if (selector.includes('itemtype')) score += 20;
  if (selector.includes('meta[')) score += 15;
  if (selector.includes('data-testid') || selector.includes('data-test')) score += 18;
  if (selector.includes('data-product') || selector.includes('data-sku') || selector.includes('data-price')) score += 18;
  if (selector.includes('aria-label')) score += 10;
  if (/js-product|js-store-prod|t750__|t-store__prod/i.test(selector)) score += 14;
  if (/^h1\b/i.test(selector)) score += 8;
  if (/^\.[a-z0-9_-]+$/i.test(selector)) score += 10;
  if (selector.includes('[class*=')) score -= 2;
  if (selector.split(/\s+/).length > 3) score -= 6;
  return score;
}

function priceTokenCount(raw: string | undefined): number {
  if (!raw) return 0;
  return (
    raw.match(
      /(?:EUR|USD|GBP|UAH|\$|\u20ac|\u00a3|\u20b4|грн\.?)\s*\d|\d[\d.,\s]*(?:EUR|USD|GBP|UAH|\$|\u20ac|\u00a3|\u20b4|грн\.?)/gi,
    )?.length ?? 0
  );
}

function productFieldCandidates(
  $: CheerioAPI,
  selectors: string[],
  field: keyof BaseProductSelectors,
  baseUrl: string,
): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  for (const selector of unique(selectors)) {
    const reason = validateCssSelector(selector);
    if (reason) continue;
    let matches: Cheerio<DomNode>;
    try {
      matches = $(selector);
    } catch {
      continue;
    }
    const count = matches.length;
    if (count === 0) continue;
    const first = matches.first();
    const raw = field === 'imageSelector' ? imageValue(first, baseUrl) : textValue(first);
    let parsed: unknown = raw;
    let valid = Boolean(raw);
    if (field === 'titleSelector') valid = Boolean(raw && raw.length >= 3 && raw.length <= 500 && /\p{L}/u.test(raw));
    if (field === 'priceSelector' || field === 'oldPriceSelector') {
      parsed = parsePrice(raw);
      valid = parsed != null;
    }
    if (field === 'availabilitySelector') {
      parsed = normalizeAvailability(raw ?? null) ?? detectAvailability(raw);
      valid = Boolean(parsed || raw);
    }
    if (field === 'imageSelector') valid = Boolean(raw);
    if (field === 'skuSelector') valid = Boolean(raw && raw.length >= 2 && raw.length <= 100);
    if (field === 'brandSelector') valid = Boolean(raw && raw.length >= 2 && raw.length <= 120);
    if (field === 'breadcrumbsSelector') {
      const crumbs = breadcrumbValue(first);
      parsed = crumbs;
      valid = Boolean(crumbs?.length);
    }
    if (!valid) continue;

    let score = 40 + selectorBonus(selector);
    if (count === 1) score += 12;
    else if (count <= 3) score += 8;
    else if (count <= 10) score -= 5;
    else score -= 20;
    if (raw && raw.length > 500) score -= 20;
    if (field === 'titleSelector' && raw && raw.length > 160) score -= 20;
    if ((field === 'priceSelector' || field === 'oldPriceSelector') && priceTokenCount(raw) > 1) score -= 18;

    candidates.push({
      selector,
      score,
      count,
      sample: raw?.slice(0, 300),
      value: raw,
      parsed,
      source: selector.includes('meta[') ? 'meta' : selector.includes('itemprop') ? 'microdata' : 'dom',
    });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function attributeProductSelectors($: CheerioAPI): Partial<Record<keyof BaseProductSelectors, string[]>> {
  const out: Partial<Record<keyof BaseProductSelectors, string[]>> = {};
  const add = (field: keyof BaseProductSelectors, selector: string) => {
    out[field] = [...(out[field] ?? []), selector];
  };

  $('[data-testid], [data-test], [aria-label], [id], [class]').each((_, node) => {
    const el = $(node);
    const attrs = [
      el.attr('data-testid'),
      el.attr('data-test'),
      el.attr('aria-label'),
      el.attr('id'),
      el.attr('class'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const dataTestId = el.attr('data-testid');
    const dataTest = el.attr('data-test');
    if (/title|name|headline|produkt-name|artikel-name/.test(attrs)) {
      if (dataTestId) add('titleSelector', `[data-testid="${quoteAttr(dataTestId)}"]`);
      if (dataTest) add('titleSelector', `[data-test="${quoteAttr(dataTest)}"]`);
    }
    if (/price|preis|amount|money/.test(attrs)) {
      if (dataTestId) add('priceSelector', `[data-testid="${quoteAttr(dataTestId)}"]`);
      if (dataTest) add('priceSelector', `[data-test="${quoteAttr(dataTest)}"]`);
    }
    if (/old|was|uvp|rrp|strike|list-price|regular-price/.test(attrs)) {
      if (dataTestId) add('oldPriceSelector', `[data-testid="${quoteAttr(dataTestId)}"]`);
      if (dataTest) add('oldPriceSelector', `[data-test="${quoteAttr(dataTest)}"]`);
    }
    if (/stock|availability|liefer|inventory/.test(attrs)) {
      if (dataTestId) add('availabilitySelector', `[data-testid="${quoteAttr(dataTestId)}"]`);
      if (dataTest) add('availabilitySelector', `[data-test="${quoteAttr(dataTest)}"]`);
    }
    if (/image|gallery|foto|bild/.test(attrs)) {
      if (dataTestId) add('imageSelector', `[data-testid="${quoteAttr(dataTestId)}"] img, [data-testid="${quoteAttr(dataTestId)}"]`);
      if (dataTest) add('imageSelector', `[data-test="${quoteAttr(dataTest)}"] img, [data-test="${quoteAttr(dataTest)}"]`);
    }
  });

  if ($('[data-price]').length) add('priceSelector', '[data-price]');
  if ($('[data-sku]').length) add('skuSelector', '[data-sku]');
  if ($('[data-product-sku]').length) add('skuSelector', '[data-product-sku]');
  if ($('[data-brand]').length) add('brandSelector', '[data-brand]');
  return out;
}

function detectProductHeuristics(html: string, pageUrl: string): {
  selectors: BaseProductSelectors;
  preview: ProductPreview;
  confidence: number;
  validation: ProductBaseValidation;
  warnings: string[];
  logs: BaseSelectorDetectionResult['logs'];
} {
  const $ = cheerio.load(html);
  const structured = extractStructuredProducts(html)[0];
  const attrSelectors = attributeProductSelectors($);
  const selectorMap: Record<keyof BaseProductSelectors, string[]> = {
    titleSelector: [...(attrSelectors.titleSelector ?? []), ...PRODUCT_TITLE_SELECTORS],
    priceSelector: [...(attrSelectors.priceSelector ?? []), ...PRODUCT_PRICE_SELECTORS],
    oldPriceSelector: [...(attrSelectors.oldPriceSelector ?? []), ...PRODUCT_OLD_PRICE_SELECTORS],
    availabilitySelector: [...(attrSelectors.availabilitySelector ?? []), ...PRODUCT_AVAILABILITY_SELECTORS],
    imageSelector: [...(attrSelectors.imageSelector ?? []), ...PRODUCT_IMAGE_SELECTORS],
    brandSelector: [...(attrSelectors.brandSelector ?? []), ...PRODUCT_BRAND_SELECTORS],
    skuSelector: [...(attrSelectors.skuSelector ?? []), ...PRODUCT_SKU_SELECTORS],
    breadcrumbsSelector: [...(attrSelectors.breadcrumbsSelector ?? []), ...PRODUCT_BREADCRUMB_SELECTORS],
  };
  const selectors: BaseProductSelectors = {};
  const logs: BaseSelectorDetectionResult['logs'] = [];

  for (const field of Object.keys(selectorMap) as Array<keyof BaseProductSelectors>) {
    const candidates = productFieldCandidates($, selectorMap[field], field, pageUrl);
    const best = candidates[0];
    if (best) {
      selectors[field] = best.selector;
      logs.push({
        level: 'info',
        message: `product ${field} detected`,
        context: { selector: best.selector, score: best.score, count: best.count, source: best.source },
      });
    }
  }

  const validation = validateProductBaseSelectors(html, pageUrl, selectors);
  const selectorPreview = validation.extracted;
  const preview: ProductPreview = {
    title: structured?.title ?? selectorPreview.title,
    price: structured?.price ?? selectorPreview.price,
    oldPrice: structured?.oldPrice ?? selectorPreview.oldPrice,
    currency: structured?.currency ?? selectorPreview.currency,
    availability: (structured?.availability as Availability | undefined) ?? selectorPreview.availability,
    image: structured?.imageUrl ? resolveHttpUrl(structured.imageUrl, pageUrl) : selectorPreview.image,
    brand: structured?.brand ?? selectorPreview.brand,
    sku: structured?.sku ?? selectorPreview.sku,
    breadcrumbs: selectorPreview.breadcrumbs,
    source: structured ? 'json-ld' : 'dom',
  };

  const confidence = scoreProductConfidence(selectors, preview, validation);
  const warnings: string[] = [];
  if (!selectors.titleSelector) warnings.push('No product title selector was detected.');
  if (!selectors.priceSelector && preview.price == null) warnings.push('No product price selector or structured price was detected.');
  return { selectors, preview, confidence, validation: { ...validation, confidence }, warnings, logs };
}

function scoreProductConfidence(
  selectors: BaseProductSelectors,
  preview: ProductPreview,
  validation: ProductBaseValidation,
): number {
  let score = 0;
  if (selectors.titleSelector && preview.title) score += 0.22;
  if (selectors.priceSelector && preview.price != null) score += 0.28;
  if (selectors.imageSelector && preview.image) score += 0.1;
  if (selectors.availabilitySelector && preview.availability) score += 0.08;
  if (selectors.oldPriceSelector && preview.oldPrice != null) score += 0.04;
  if (selectors.brandSelector && preview.brand) score += 0.04;
  if (selectors.skuSelector && preview.sku) score += 0.04;
  if (selectors.breadcrumbsSelector && preview.breadcrumbs?.length) score += 0.04;
  if (preview.source === 'json-ld') score += 0.16;
  if (validation.ok) score += 0.08;
  return round2(score);
}

function findCommonCardSelector($: CheerioAPI): string | null {
  const candidates = CATEGORY_CARD_SELECTORS.map((selector) => {
    try {
      return { selector, count: $(selector).length };
    } catch {
      return { selector, count: 0 };
    }
  })
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count);
  return candidates[0]?.selector ?? null;
}

function findWithin(card: Cheerio<DomNode>, selector: string): Cheerio<DomNode> {
  try {
    return card.find(selector).addBack(selector);
  } catch {
    return card.find('__cr_invalid_selector__');
  }
}

function cardFieldValue(
  card: Cheerio<DomNode>,
  selector: string,
  field: keyof BaseCategorySelectors,
  baseUrl: string,
): { raw?: string; parsed?: unknown; valid: boolean } {
  if (field === 'cardLinkSelector' && selector === '[data-tooltip-hook]') {
    const popupHook = card.parents('[data-tooltip-hook]').first().attr('data-tooltip-hook') ?? card.attr('data-tooltip-hook');
    const value = resolveHttpUrl(popupHook, baseUrl);
    return { raw: value, parsed: value, valid: Boolean(value) };
  }
  const el = findWithin(card, selector).first();
  if (!el.length) return { valid: false };
  if (field === 'cardImageSelector') {
    const value = imageValue(el, baseUrl);
    return { raw: value, parsed: value, valid: Boolean(value) };
  }
  if (field === 'cardLinkSelector') {
    const value = linkValue(el, baseUrl);
    return { raw: value, parsed: value, valid: Boolean(value) };
  }
  const raw = textValue(el);
  if (field === 'cardPriceSelector' || field === 'cardOldPriceSelector') {
    const price = parsePrice(raw);
    return { raw, parsed: price, valid: price != null };
  }
  if (field === 'cardAvailabilitySelector') {
    const availability = normalizeAvailability(raw ?? null) ?? detectAvailability(raw);
    return { raw, parsed: availability, valid: Boolean(availability || raw) };
  }
  if (field === 'cardTitleSelector') {
    return { raw, parsed: raw, valid: Boolean(raw && raw.length >= 3 && /\p{L}/u.test(raw)) };
  }
  return { raw, parsed: raw, valid: Boolean(raw) };
}

function inferCardFieldSelector(
  $: CheerioAPI,
  cards: Cheerio<DomNode>,
  selectors: string[],
  field: keyof BaseCategorySelectors,
  baseUrl: string,
  minCoverage: number,
): string | null {
  type InferredFieldScore = { selector: string; score: number; validCount: number; firstSample: string | undefined };
  const sampleCards = cards.slice(0, 12);
  const total = Math.max(1, sampleCards.length);
  const scored = unique(selectors)
    .map((selector) => {
      const reason = validateCssSelector(selector);
      if (reason) return null;
      let validCount = 0;
      let firstSample: string | undefined;
      sampleCards.each((_, node) => {
        const result = cardFieldValue($(node), selector, field, baseUrl);
        if (!result.valid) return;
        validCount += 1;
        firstSample = firstSample ?? result.raw?.slice(0, 200);
      });
      const coverage = validCount / total;
      if (coverage < minCoverage) return null;
      const score = coverage * 100 + selectorBonus(selector);
      return { selector, score, validCount, firstSample };
    })
    .filter((item): item is InferredFieldScore => item != null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.selector ?? null;
}

function detectPaginationSelector($: CheerioAPI, pageUrl: string): { selector?: string; url?: string } {
  for (const selector of PAGINATION_NEXT_SELECTORS) {
    let el: Cheerio<DomNode>;
    try {
      el = $(selector).first();
    } catch {
      continue;
    }
    const url = linkValue(el, pageUrl) ?? resolveHttpUrl(el.attr('href'), pageUrl);
    if (url && url !== pageUrl) return { selector, url };
  }
  const fallback = $('a[href]')
    .toArray()
    .map((node) => $(node))
    .find((el) => {
      const label = (textValue(el) ?? '').toLowerCase();
      return /next|weiter|n(?:a|\u00e4)chste/.test(label);
    });
  if (!fallback) return {};
  const href = fallback.attr('href');
  return { selector: 'a[href]', url: resolveHttpUrl(href, pageUrl) };
}

function detectLoadMoreSelector($: CheerioAPI): { selector?: string; label?: string } {
  for (const selector of LOAD_MORE_SELECTORS) {
    let el: Cheerio<DomNode>;
    try {
      el = $(selector).first();
    } catch {
      continue;
    }
    if (el.length) return { selector, label: textValue(el) };
  }
  const fallback = $('button, a')
    .toArray()
    .map((node) => $(node))
    .find((el) => {
      const label = (textValue(el) ?? '').toLowerCase();
      return /load more|show more|mehr laden|weitere|mehr anzeigen/.test(label);
    });
  if (!fallback) return {};
  const tag = (fallback.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? 'button';
  return { selector: tag, label: textValue(fallback) };
}

function extractCategoryPreviewFromSelectors(
  html: string,
  pageUrl: string,
  selectors: BaseCategorySelectors,
): CategoryPreview {
  const $ = cheerio.load(html);
  const cards = selectors.productCardSelector ? safeSelect($, selectors.productCardSelector) : null;
  const previewCards: CategoryPreviewCard[] = [];
  cards?.slice(0, 6).each((_, node) => {
    const card = $(node);
    const titleResult = selectors.cardTitleSelector
      ? cardFieldValue(card, selectors.cardTitleSelector, 'cardTitleSelector', pageUrl)
      : { valid: false };
    const priceResult = selectors.cardPriceSelector
      ? cardFieldValue(card, selectors.cardPriceSelector, 'cardPriceSelector', pageUrl)
      : { valid: false };
    const oldPriceResult = selectors.cardOldPriceSelector
      ? cardFieldValue(card, selectors.cardOldPriceSelector, 'cardOldPriceSelector', pageUrl)
      : { valid: false };
    const imageResult = selectors.cardImageSelector
      ? cardFieldValue(card, selectors.cardImageSelector, 'cardImageSelector', pageUrl)
      : { valid: false };
    const linkResult = selectors.cardLinkSelector
      ? cardFieldValue(card, selectors.cardLinkSelector, 'cardLinkSelector', pageUrl)
      : { valid: false };
    const availabilityResult = selectors.cardAvailabilitySelector
      ? cardFieldValue(card, selectors.cardAvailabilitySelector, 'cardAvailabilitySelector', pageUrl)
      : { valid: false };
    const rawPrice = priceResult.raw;
    previewCards.push({
      title: titleResult.raw,
      price: typeof priceResult.parsed === 'number' ? priceResult.parsed : undefined,
      oldPrice: typeof oldPriceResult.parsed === 'number' ? oldPriceResult.parsed : undefined,
      currency: detectCurrency(rawPrice),
      availability: availabilityResult.parsed as Availability | undefined,
      image: imageResult.raw,
      link: linkResult.raw,
    });
  });
  const pagination = detectPaginationSelector($, pageUrl);
  const loadMore = detectLoadMoreSelector($);
  return {
    cardCount: cards?.length ?? 0,
    cards: previewCards,
    paginationNext: pagination.url,
    loadMore: loadMore.label,
  };
}

function safeSelect($: CheerioAPI, selector: string): Cheerio<DomNode> | null {
  try {
    return $(selector);
  } catch {
    return null;
  }
}

function detectCategoryHeuristics(html: string, pageUrl: string): {
  selectors: BaseCategorySelectors;
  preview: CategoryPreview;
  confidence: number;
  validation: CategoryBaseValidation;
  warnings: string[];
  logs: BaseSelectorDetectionResult['logs'];
} {
  const $ = cheerio.load(html);
  const detector = detectProductCards(html, { pageUrl });
  const productCardSelector = detector.cardSelector ?? findCommonCardSelector($);
  const selectors: BaseCategorySelectors = { productCardSelector };
  const logs: BaseSelectorDetectionResult['logs'] = [
    ...detector.logs.map((entry) => ({ level: entry.level, message: entry.message, context: entry.context })),
  ];

  if (productCardSelector) {
    const cards = $(productCardSelector);
    selectors.cardTitleSelector = inferCardFieldSelector($, cards, CARD_TITLE_SELECTORS, 'cardTitleSelector', pageUrl, 0.5);
    selectors.cardPriceSelector = inferCardFieldSelector($, cards, CARD_PRICE_SELECTORS, 'cardPriceSelector', pageUrl, 0.5);
    selectors.cardOldPriceSelector = inferCardFieldSelector($, cards, CARD_OLD_PRICE_SELECTORS, 'cardOldPriceSelector', pageUrl, 0.2);
    selectors.cardImageSelector = inferCardFieldSelector($, cards, CARD_IMAGE_SELECTORS, 'cardImageSelector', pageUrl, 0.5);
    selectors.cardLinkSelector = inferCardFieldSelector($, cards, CARD_LINK_SELECTORS, 'cardLinkSelector', pageUrl, 0.5);
    selectors.cardAvailabilitySelector = inferCardFieldSelector(
      $,
      cards,
      CARD_AVAILABILITY_SELECTORS,
      'cardAvailabilitySelector',
      pageUrl,
      0.2,
    );
  }

  const pagination = detectPaginationSelector($, pageUrl);
  if (pagination.selector) selectors.paginationNextSelector = pagination.selector;
  const loadMore = detectLoadMoreSelector($);
  if (loadMore.selector) selectors.loadMoreSelector = loadMore.selector;

  const preview = extractCategoryPreviewFromSelectors(html, pageUrl, selectors);
  if (preview.cards.length === 0 && detector.cards.length > 0) {
    preview.cards = detector.cards.slice(0, 6).map((card) => ({
      title: card.title,
      price: card.price,
      oldPrice: card.oldPrice,
      currency: card.currency,
      availability: card.availability,
      image: card.imageUrl,
      link: card.productUrl,
    }));
    preview.cardCount = detector.cards.length;
  }
  const validation = validateCategoryBaseSelectors(html, pageUrl, selectors);
  const confidence = scoreCategoryConfidence(selectors, preview, validation, detector.confidence);
  const warnings: string[] = [];
  if (!selectors.productCardSelector) warnings.push('No repeated product card selector was detected.');
  if (selectors.productCardSelector && preview.cardCount < 2) warnings.push('Product card selector matched fewer than two cards.');
  return { selectors, preview, confidence, validation: { ...validation, confidence }, warnings, logs };
}

function scoreCategoryConfidence(
  selectors: BaseCategorySelectors,
  preview: CategoryPreview,
  validation: CategoryBaseValidation,
  detectorConfidence: number,
): number {
  let score = Math.min(0.2, detectorConfidence * 0.2);
  if (selectors.productCardSelector && preview.cardCount >= 2) score += 0.25;
  if (selectors.cardTitleSelector && preview.cards.some((card) => card.title)) score += 0.12;
  if (selectors.cardPriceSelector && preview.cards.some((card) => card.price != null)) score += 0.14;
  if (selectors.cardLinkSelector && preview.cards.some((card) => card.link)) score += 0.12;
  if (selectors.cardImageSelector && preview.cards.some((card) => card.image)) score += 0.1;
  if (selectors.cardOldPriceSelector && preview.cards.some((card) => card.oldPrice != null)) score += 0.03;
  if (selectors.cardAvailabilitySelector && preview.cards.some((card) => card.availability)) score += 0.04;
  if (selectors.paginationNextSelector || selectors.loadMoreSelector) score += 0.04;
  if (validation.ok) score += 0.08;
  return round2(score);
}

function mergeProductSelectors(base: BaseProductSelectors, ai: SelectorSuggestion, html: string, pageUrl: string): BaseProductSelectors {
  const candidate: BaseProductSelectors = {
    titleSelector: ai.titleSelector ?? null,
    priceSelector: ai.priceSelector ?? null,
    oldPriceSelector: ai.oldPriceSelector ?? null,
    availabilitySelector: ai.availabilitySelector ?? null,
    imageSelector: ai.imageSelector ?? null,
    brandSelector: ai.brandSelector ?? null,
    skuSelector: ai.skuSelector ?? null,
    breadcrumbsSelector: ai.breadcrumbsSelector ?? null,
  };
  const validation = validateProductBaseSelectors(html, pageUrl, candidate);
  const merged = { ...base };
  for (const key of Object.keys(candidate) as Array<keyof BaseProductSelectors>) {
    const selector = candidate[key];
    if (!selector) continue;
    const valid = validation.fields[key]?.valid;
    if (valid && !base[key]) merged[key] = selector;
  }
  return merged;
}

function mergeCategorySelectors(base: BaseCategorySelectors, ai: CategorySuggestion, html: string, pageUrl: string): BaseCategorySelectors {
  const candidate: BaseCategorySelectors = {
    productCardSelector: ai.productCardSelector ?? null,
    cardTitleSelector: ai.cardTitleSelector ?? null,
    cardPriceSelector: ai.cardPriceSelector ?? null,
    cardOldPriceSelector: ai.cardOldPriceSelector ?? null,
    cardImageSelector: ai.cardImageSelector ?? null,
    cardLinkSelector: ai.cardLinkSelector ?? null,
    cardAvailabilitySelector: ai.cardAvailabilitySelector ?? null,
    paginationNextSelector: ai.paginationNextSelector ?? null,
    loadMoreSelector: ai.loadMoreSelector ?? null,
  };
  const validation = validateCategoryBaseSelectors(html, pageUrl, candidate);
  const merged = { ...base };
  for (const key of Object.keys(candidate) as Array<keyof BaseCategorySelectors>) {
    const selector = candidate[key];
    if (!selector) continue;
    const valid = validation.fields[key]?.valid;
    if (valid && !base[key]) merged[key] = selector;
  }
  return merged;
}

async function applyProductAiFallback(
  html: string,
  pageUrl: string,
  detected: ReturnType<typeof detectProductHeuristics>,
  provider: AIProvider | null | undefined,
  useAi: boolean,
): Promise<ReturnType<typeof detectProductHeuristics>> {
  if (!useAi || !provider || detected.confidence >= 0.65) return detected;
  const cleaned = cleanDom(html);
  let suggestion: SelectorSuggestion;
  try {
    suggestion = await provider.detectProductSelectors({
      url: pageUrl,
      cleanedDom: cleaned.html,
      domHash: cleaned.hash,
    });
  } catch (err) {
    return {
      ...detected,
      warnings: [...detected.warnings, `AI product selector fallback failed: ${(err as Error).message}`],
      logs: [
        ...detected.logs,
        { level: 'warn', message: 'product AI fallback failed', context: { error: (err as Error).message } },
      ],
    };
  }
  const selectors = mergeProductSelectors(detected.selectors, suggestion, html, pageUrl);
  const validation = validateProductBaseSelectors(html, pageUrl, selectors);
  const preview = {
    ...detected.preview,
    ...Object.fromEntries(Object.entries(validation.extracted).filter(([, value]) => value != null)),
  } as ProductPreview;
  const confidence = Math.max(detected.confidence, scoreProductConfidence(selectors, preview, validation));
  return {
    ...detected,
    selectors,
    preview,
    confidence,
    validation: { ...validation, confidence },
    logs: [
      ...detected.logs,
      {
        level: 'info',
        message: 'product AI fallback evaluated',
        context: { aiConfidence: suggestion.confidence, acceptedConfidence: confidence },
      },
    ],
  };
}

async function applyCategoryAiFallback(
  html: string,
  pageUrl: string,
  detected: ReturnType<typeof detectCategoryHeuristics>,
  provider: AIProvider | null | undefined,
  useAi: boolean,
): Promise<ReturnType<typeof detectCategoryHeuristics>> {
  if (!useAi || !provider || detected.confidence >= 0.65) return detected;
  const cleaned = cleanDom(html);
  let suggestion: CategorySuggestion;
  try {
    suggestion = await provider.detectCategorySelectors({
      url: pageUrl,
      cleanedDom: cleaned.html,
      domHash: cleaned.hash,
    });
  } catch (err) {
    return {
      ...detected,
      warnings: [...detected.warnings, `AI category selector fallback failed: ${(err as Error).message}`],
      logs: [
        ...detected.logs,
        { level: 'warn', message: 'category AI fallback failed', context: { error: (err as Error).message } },
      ],
    };
  }
  const selectors = mergeCategorySelectors(detected.selectors, suggestion, html, pageUrl);
  const validation = validateCategoryBaseSelectors(html, pageUrl, selectors);
  const preview = extractCategoryPreviewFromSelectors(html, pageUrl, selectors);
  const confidence = Math.max(detected.confidence, scoreCategoryConfidence(selectors, preview, validation, 0));
  return {
    ...detected,
    selectors,
    preview,
    confidence,
    validation: { ...validation, confidence },
    logs: [
      ...detected.logs,
      {
        level: 'info',
        message: 'category AI fallback evaluated',
        context: { aiConfidence: suggestion.confidence, acceptedConfidence: confidence },
      },
    ],
  };
}

export function validateProductBaseSelectors(
  html: string,
  pageUrl: string,
  selectors: BaseProductSelectors,
): ProductBaseValidation {
  const $ = cheerio.load(html);
  const fields: ProductBaseValidation['fields'] = {};
  const extracted: ProductPreview = {};

  for (const [key, selector] of Object.entries(selectors) as Array<[keyof BaseProductSelectors, string | null | undefined]>) {
    if (!selector) continue;
    const selectorReason = validateCssSelector(selector);
    let count = 0;
    let sample: string | undefined;
    let valid = !selectorReason;
    let reason = selectorReason;
    try {
      const matches = $(selector);
      count = matches.length;
      const first = matches.first();
      sample = sampleForField($, selector, key, pageUrl);
      if (count === 0) {
        valid = false;
        reason = 'selector matched nothing';
      } else if (count > 50 && key !== 'breadcrumbsSelector') {
        valid = false;
        reason = 'selector matched too many elements';
      } else if (key === 'titleSelector') {
        const value = textValue(first);
        extracted.title = value;
        valid = Boolean(value && value.length >= 3);
        reason = valid ? undefined : 'title selector did not produce text';
      } else if (key === 'priceSelector') {
        const value = textValue(first);
        const price = parsePrice(value);
        extracted.price = price;
        extracted.currency = detectCurrency(value);
        valid = price != null;
        reason = valid ? undefined : 'price selector did not produce a parseable price';
      } else if (key === 'oldPriceSelector') {
        const value = textValue(first);
        const price = parsePrice(value);
        extracted.oldPrice = price;
        valid = price != null;
        reason = valid ? undefined : 'old price selector did not produce a parseable price';
      } else if (key === 'availabilitySelector') {
        const value = textValue(first);
        extracted.availability = normalizeAvailability(value ?? null) ?? detectAvailability(value);
        valid = Boolean(extracted.availability || value);
        reason = valid ? undefined : 'availability selector did not produce text';
      } else if (key === 'imageSelector') {
        extracted.image = imageValue(first, pageUrl);
        valid = Boolean(extracted.image);
        reason = valid ? undefined : 'image selector did not produce a usable URL';
      } else if (key === 'brandSelector') {
        extracted.brand = textValue(first);
        valid = Boolean(extracted.brand);
        reason = valid ? undefined : 'brand selector did not produce text';
      } else if (key === 'skuSelector') {
        extracted.sku = textValue(first);
        valid = Boolean(extracted.sku);
        reason = valid ? undefined : 'sku selector did not produce text';
      } else if (key === 'breadcrumbsSelector') {
        extracted.breadcrumbs = breadcrumbValue(first);
        valid = Boolean(extracted.breadcrumbs?.length);
        reason = valid ? undefined : 'breadcrumbs selector did not produce breadcrumbs';
      }
    } catch {
      fields[key] = { selector, count: 0, valid: false, reason: 'invalid css selector' };
      continue;
    }
    fields[key] = { selector, count, sample, valid, reason };
  }

  const invalidCount = Object.values(fields).filter((field) => !field.valid).length;
  const requiredOk = Boolean(extracted.title) && extracted.price != null;
  let confidence = 0;
  if (extracted.title) confidence += 0.25;
  if (extracted.price != null) confidence += 0.35;
  if (extracted.image) confidence += 0.1;
  if (extracted.availability) confidence += 0.08;
  confidence -= invalidCount * 0.12;
  return { ok: requiredOk && invalidCount === 0, confidence: round2(confidence), fields, extracted };
}

export function validateCategoryBaseSelectors(
  html: string,
  pageUrl: string,
  selectors: BaseCategorySelectors,
): CategoryBaseValidation {
  const $ = cheerio.load(html);
  const fields: CategoryBaseValidation['fields'] = {};
  const cards = selectors.productCardSelector ? safeSelect($, selectors.productCardSelector) : null;
  const cardCount = cards?.length ?? 0;

  if (selectors.productCardSelector) {
    fields.productCardSelector = {
      selector: selectors.productCardSelector,
      count: cardCount,
      valid: cardCount >= 2 && cardCount <= 500,
      reason: cardCount === 0 ? 'selector matched nothing' : cardCount < 2 ? 'card selector must match multiple cards' : undefined,
      sample: cards?.first().text().replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  }

  for (const [key, selector] of Object.entries(selectors) as Array<[keyof BaseCategorySelectors, string | null | undefined]>) {
    if (!selector || key === 'productCardSelector') continue;
    const selectorReason = validateCssSelector(selector);
    if (selectorReason) {
      fields[key] = { selector, count: 0, valid: false, reason: selectorReason };
      continue;
    }
    if (key === 'paginationNextSelector') {
      const el = safeSelect($, selector);
      const count = el?.length ?? 0;
      const url = el?.first() ? linkValue(el.first(), pageUrl) ?? resolveHttpUrl(el.first().attr('href'), pageUrl) : undefined;
      fields[key] = { selector, count, valid: count > 0 && Boolean(url), reason: count === 0 ? 'selector matched nothing' : url ? undefined : 'selector did not produce a link URL', sample: url };
      continue;
    }
    if (key === 'loadMoreSelector') {
      const el = safeSelect($, selector);
      const count = el?.length ?? 0;
      const label = el?.first() ? textValue(el.first()) : undefined;
      fields[key] = { selector, count, valid: count > 0 && Boolean(label), reason: count === 0 ? 'selector matched nothing' : label ? undefined : 'selector did not produce text', sample: label };
      continue;
    }
    if (!cards || cardCount === 0) {
      fields[key] = { selector, count: 0, valid: false, reason: 'card selector must be valid first' };
      continue;
    }
    let validCount = 0;
    let firstSample: string | undefined;
    cards.slice(0, 20).each((_, node) => {
      const result = cardFieldValue($(node), selector, key, pageUrl);
      if (!result.valid) return;
      validCount += 1;
      firstSample = firstSample ?? result.raw?.slice(0, 300);
    });
    const requiredCoverage = key === 'cardOldPriceSelector' || key === 'cardAvailabilitySelector' ? 0.15 : 0.5;
    const coverage = cardCount > 0 ? validCount / Math.min(cardCount, 20) : 0;
    fields[key] = {
      selector,
      count: validCount,
      valid: coverage >= requiredCoverage,
      reason: coverage >= requiredCoverage ? undefined : 'selector did not work across enough cards',
      sample: firstSample,
    };
  }

  const extracted = extractCategoryPreviewFromSelectors(html, pageUrl, selectors);
  const invalidCount = Object.values(fields).filter((field) => !field.valid).length;
  const hasUsefulCards = extracted.cards.some((card) => card.title || card.link) && extracted.cards.some((card) => card.price != null || card.image);
  let confidence = 0;
  if (cardCount >= 2) confidence += 0.35;
  if (extracted.cards.some((card) => card.title)) confidence += 0.15;
  if (extracted.cards.some((card) => card.price != null)) confidence += 0.18;
  if (extracted.cards.some((card) => card.link)) confidence += 0.12;
  if (extracted.cards.some((card) => card.image)) confidence += 0.1;
  confidence -= invalidCount * 0.08;
  return {
    ok: cardCount >= 2 && hasUsefulCards && invalidCount === 0,
    confidence: round2(confidence),
    fields,
    extracted,
  };
}

export function findFirstProductUrl(html: string, pageUrl: string): string | undefined {
  const detected = detectProductCards(html, { pageUrl });
  const fromDetected = detected.cards.find((card) => card.productUrl)?.productUrl;
  if (fromDetected) return fromDetected;
  const $ = cheerio.load(html);
  const cardSelector = detected.cardSelector ?? findCommonCardSelector($);
  if (cardSelector) {
    const card = $(cardSelector).first();
    for (const selector of CARD_LINK_SELECTORS) {
      const url = linkValue(findWithin(card, selector).first(), pageUrl);
      if (url) return url;
    }
  }
  return undefined;
}

export async function detectBaseSelectorsFromPages(input: BaseSelectorDetectionInput): Promise<BaseSelectorDetectionResult> {
  const warnings: string[] = [];
  const logs: BaseSelectorDetectionResult['logs'] = [];
  let productResult: Awaited<ReturnType<typeof applyProductAiFallback>> | undefined;
  let categoryResult: Awaited<ReturnType<typeof applyCategoryAiFallback>> | undefined;

  if (input.productPage) {
    const detected = detectProductHeuristics(input.productPage.html, input.productPage.url);
    productResult = await applyProductAiFallback(
      input.productPage.html,
      input.productPage.url,
      detected,
      input.aiProvider,
      input.useAi,
    );
    warnings.push(...productResult.warnings);
    logs.push(...productResult.logs);
  } else {
    warnings.push('No product URL was available, so product page selectors were not detected.');
  }

  if (input.categoryPage) {
    const detected = detectCategoryHeuristics(input.categoryPage.html, input.categoryPage.url);
    categoryResult = await applyCategoryAiFallback(
      input.categoryPage.html,
      input.categoryPage.url,
      detected,
      input.aiProvider,
      input.useAi,
    );
    warnings.push(...categoryResult.warnings);
    logs.push(...categoryResult.logs);
  } else {
    warnings.push('No category URL was available, so listing selectors were not detected.');
  }

  const productConfidence = productResult?.confidence ?? 0;
  const categoryConfidence = categoryResult?.confidence ?? 0;
  const available = [productResult ? productConfidence : undefined, categoryResult ? categoryConfidence : undefined].filter(
    (value): value is number => value != null,
  );
  const overall = available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : 0;

  return {
    productSelectors: productResult?.selectors ?? {},
    categorySelectors: categoryResult?.selectors ?? {},
    preview: {
      product: productResult?.preview,
      category: categoryResult?.preview,
    },
    confidence: {
      overall: round2(overall),
      product: productConfidence,
      category: categoryConfidence,
    },
    validation: {
      product: productResult?.validation,
      category: categoryResult?.validation,
    },
    warnings: unique(warnings),
    logs,
  };
}
