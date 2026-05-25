/**
 * Per-card field extraction. Takes a cheerio element already classified as a
 * product card and pulls out: title / price / oldPrice / currency / url /
 * imageUrl / availability / brand / rating / discount.
 *
 * Reuses the same strict price-shape validation as product-card-extractor
 * (refuses runaway-digit and two-prices-fused inputs) so the data shape is
 * consistent regardless of which detector fired first.
 */
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
type DomNode = AnyNode;
import { detectAvailability, detectCurrency, parsePrice } from '../util/normalize.js';
import type { Availability } from '../types.js';

export interface ExtractedCard {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  productUrl?: string;
  imageUrl?: string;
  availability: Availability;
  brand?: string;
  sku?: string;
  ean?: string;
  gtin?: string;
  rating?: number;
  discountPct?: number;
  rawText?: string;
  sourceSelectors: string[];
}

const MAX_PRICE = 100_000;

/** Recognised currency tokens — both major-Latin and CIS symbols. */
const CURRENCY_TOKEN =
  '€|EUR|\\$|USD|£|GBP|₽|RUB|руб\\.?|р\\.|₴|UAH|грн\\.?|₸|тг|KZT|zł|PLN|Kč|CZK|CHF|Fr\\.';

const SINGLE_PRICE_SHAPE = new RegExp(
  `^\\s*(?:${CURRENCY_TOKEN})?\\s*(?:\\d{1,3}(?:[.,\\s]\\d{3})*(?:\\s*[-–]\\s*\\d{1,6})?(?:[,.]\\d{1,2}|,-)?|\\d{1,6}(?:\\s*[-–]\\s*\\d{1,6})?[,.]\\d{1,2}|\\d{1,6}(?:\\s*[-–]\\s*\\d{1,6})?)\\s*(?:${CURRENCY_TOKEN})?\\s*$`,
  'i',
);

// Anchored price regex: one currency-flanked numeric token. Currency set must
// stay in sync with CURRENCY_TOKEN above (RUB, UAH, KZT, PLN, CZK, CHF…).
const PRICE_ANCHORED_RE =
  /(?:€|EUR|\$|USD|£|GBP|₽|RUB|руб\.?|р\.|₴|UAH|грн\.?|₸|тг|KZT|zł|PLN|Kč|CZK|CHF|Fr\.)\s*([0-9]{1,6}(?:\s*[-–]\s*[0-9]{1,6})?(?:[.  ]?[0-9]{3})*(?:[,.](?:[0-9]{1,2}|-))?)|([0-9]{1,6}(?:\s*[-–]\s*[0-9]{1,6})?(?:[.  ]?[0-9]{3})*(?:[,.](?:[0-9]{1,2}|-))?)\s*(?:€|EUR|\$|USD|£|GBP|₽|RUB|руб\.?|р\.|₴|UAH|грн\.?|₸|тг|KZT|zł|PLN|Kč|CZK|CHF|Fr\.)/i;

const PRICE_ANCHORED_RE_GLOBAL = new RegExp(PRICE_ANCHORED_RE.source, 'gi');

function txt(el: Cheerio<DomNode>): string {
  return el.text().replace(/\s+/g, ' ').trim();
}

function tryParseSinglePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!SINGLE_PRICE_SHAPE.test(t)) return undefined;
  if ((t.match(/€|EUR|\$|USD|£|GBP/gi)?.length ?? 0) > 1) return undefined;
  if (/,-/.test(t)) {
    const whole = t.split(',-')[0]?.replace(/[^\d]/g, '');
    const n = whole ? Number(whole) : undefined;
    return typeof n === 'number' && n > 0 && n <= MAX_PRICE ? n : undefined;
  }
  const n = parsePrice(t);
  if (n == null || n <= 0 || n > MAX_PRICE) return undefined;
  return n;
}

function allAnchoredPrices(text: string): number[] {
  const matches = text.match(PRICE_ANCHORED_RE_GLOBAL) ?? [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of matches) {
    const v = tryParseSinglePrice(m);
    if (v != null && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function pickImageAttr(img: Cheerio<DomNode>): string | undefined {
  const order = [
    'data-srcset',
    'data-src',
    'data-original',
    'data-lazy',
    'data-lazy-src',
    'data-image',
    'data-cy-img-src',
    'data-bg',
    'data-original',
    'content',
    'srcset',
    'src',
  ];
  for (const a of order) {
    const raw = img.attr(a)?.trim();
    if (!raw) continue;
    const first = raw.split(',')[0]?.trim().split(/\s+/)[0];
    if (!first) continue;
    if (/^data:image\//i.test(first)) continue;
    return first;
  }
  return undefined;
}

function resolveAbsolute(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  if (/^(?:data|javascript|mailto|tel):/i.test(raw)) return undefined;
  try {
    const u = new URL(raw, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function pickProductLink($: CheerioAPI, card: Cheerio<DomNode>): string | undefined {
  // Card itself may BE the link (e.g. WooCommerce LoopProduct-link), or carry
  // a direct product URL in a data-* attribute (Tilda, InSales, …). These
  // attribute-level URLs are the most reliable signal — try them first.
  const candidates: string[] = [];
  const attrUrl =
    card.attr('data-product-url') ??
    card.attr('data-product-link') ??
    card.attr('data-product-href') ??
    card.attr('data-href') ??
    card.parents('[data-tooltip-hook]').first().attr('data-tooltip-hook');
  if (attrUrl) candidates.push(attrUrl);
  const selfHref = card.attr('href');
  if (selfHref) candidates.push(selfHref);
  for (const a of card.find('a[href]').toArray()) {
    const href = ($(a).attr('href') ?? '').trim();
    if (href) candidates.push(href);
  }
  for (const href of candidates) {
    if (!href) continue;
    if (/^(?:javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    if (href.startsWith('#') && !href.startsWith('#popup:')) continue;
    if (/\/(?:cart|checkout|login|signin|account|wishlist|compare|search|filter)(?:\/|$|\?)/i.test(href)) {
      continue;
    }
    return href;
  }
  return undefined;
}

function rating(text: string): number | undefined {
  const m = text.match(/\b(\d(?:[.,]\d)?)\s?\/\s?5\b/);
  if (m && m[1]) {
    const n = Number(m[1].replace(',', '.'));
    if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
  }
  return undefined;
}

function discount(text: string): number | undefined {
  const m = text.match(/-?(\d{1,2})\s?%/);
  if (m && m[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 90) return n;
  }
  return undefined;
}

function cleanIdentifier(raw: string | undefined): string | undefined {
  const value = raw?.replace(/\s+/g, ' ').trim();
  if (!value) return undefined;
  if (value.length < 3 || value.length > 80) return undefined;
  return value;
}

function pickAttrOrText(card: Cheerio<DomNode>, attrNames: string[], selectors: string[]): string | undefined {
  for (const attrName of attrNames) {
    const self = cleanIdentifier(card.attr(attrName));
    if (self) return self;
    const nested = cleanIdentifier(card.find(`[${attrName}]`).first().attr(attrName));
    if (nested) return nested;
  }
  for (const selector of selectors) {
    const value = cleanIdentifier(txt(card.find(selector).first()));
    if (value) return value;
  }
  return undefined;
}

export interface ExtractOptions {
  baseUrl: string;
}

export function extractFields(
  $: CheerioAPI,
  card: Cheerio<DomNode>,
  opts: ExtractOptions,
): ExtractedCard {
  const sources: string[] = [];
  const cardText = txt(card);

  // --- title -----------------------------------------------------------------
  const titleCandidates = [
    '[itemprop="name"]',
    '[data-testid*="title" i]',
    '[data-testid*="name" i]',
    '.js-product-name',
    '.t750__title',
    '.t-store__prod-popup__name',
    'h2',
    'h3',
    '[class*="title" i]',
    '[class*="name" i]',
    'a[title]',
  ];
  let title: string | undefined;
  for (const sel of titleCandidates) {
    const el = card.find(sel).first();
    if (!el.length) continue;
    const candidate = txt(el) || (el.attr('title') ?? '').trim();
    if (candidate.length >= 3 && candidate.length <= 250 && /\p{L}/u.test(candidate)) {
      title = candidate;
      sources.push(`title:${sel}`);
      break;
    }
  }
  if (!title) {
    const linkText = txt(card.find('a[href]').first());
    if (linkText.length >= 8) {
      title = linkText;
      sources.push('title:link_text');
    }
  }
  if (!title) {
    const alt = (card.find('img').first().attr('alt') ?? '').trim();
    if (alt.length >= 3) {
      title = alt;
      sources.push('title:img_alt');
    }
  }

  // --- price (current / old) ------------------------------------------------
  const currentSelectors = [
    '[itemprop="price"]',
    '[data-testid*="price-current" i]',
    '[data-testid*="current-price" i]',
    '.js-store-prod-price',
    '.js-store-prod-price-val',
    '.js-product-price',
    '.t750__price',
    '.t750__price-value',
    '[class*="price--special" i]',
    '[class*="price--sale" i]',
    '[class*="price--current" i]',
    '[class*="sale-price" i]',
    '[class*="current-price" i]',
    'ins[class*="price" i]',
    '[class*="final-price" i]',
  ];
  let priceText: string | undefined;
  for (const sel of currentSelectors) {
    const el = card.find(sel).first();
    if (!el.length) continue;
    const t = txt(el);
    if (t) {
      priceText = t;
      sources.push(`price:${sel}`);
      break;
    }
  }
  if (!priceText) {
    const fallback = card
      .find('[data-testid*="price" i], [data-test*="price" i], [class*="price" i], [class*="preis" i]')
      .not(
        '[class*="--old" i], [class*="-old" i], [class*="_old" i], [class*="was" i], ' +
          '[class*="rrp" i], [class*="uvp" i], [class*="price_list" i], ' +
          // Exclude price WRAPPERS — they contain multiple <span>s and parse as
          // "699 ₽ 795 ₽" which fails the single-price shape guard. We want the
          // leaf element holding ONE current price.
          '[class*="price-wrapper" i], [class*="price_wrapper" i], ' +
          '[class*="price-wrap" i], [class*="price_wrap" i], ' +
          '[class*="prices" i]',
      )
      .first();
    if (fallback.length) {
      const t = txt(fallback);
      if (t) {
        priceText = t;
        sources.push('price:generic');
      }
    }
  }

  let price = tryParseSinglePrice(priceText);
  const anchored = allAnchoredPrices(cardText);
  if (price == null && anchored.length > 0) {
    price = anchored[0];
    sources.push('price:cardText_anchored');
  }

  // Old price — covers `price--old` (dash), `price_old` (underscore, Tilda),
  // `old-price` (Magento), `was-price`, `price_list`, RRP / UVP markers.
  const oldSelectors = [
    '[class*="price--old" i]',
    '.js-store-prod-price-old',
    '.js-store-prod-price-old-val',
    '.t750__price_old',
    '[class*="price_old" i]',
    '[class*="old-price" i]',
    '[class*="price--was" i]',
    '[class*="was-price" i]',
    '[class*="price_list" i]',
    '[class*="rrp" i]',
    '[class*="uvp" i]',
    'del[class*="price" i]',
    's[class*="price" i]',
  ];
  let oldPrice: number | undefined;
  for (const sel of oldSelectors) {
    const el = card.find(sel).first();
    if (!el.length) continue;
    const v = tryParseSinglePrice(txt(el));
    if (v != null && (price == null || v > price)) {
      oldPrice = v;
      sources.push(`oldPrice:${sel}`);
      break;
    }
  }
  if (oldPrice == null && price != null) {
    const above = anchored.filter((v) => v > price! && v <= price! * 10).sort((a, b) => b - a)[0];
    if (above != null) {
      oldPrice = above;
      sources.push('oldPrice:cardText_anchored');
    }
  }
  if (price != null && oldPrice != null && oldPrice <= price) oldPrice = undefined;
  if (price != null && (price <= 0 || price > MAX_PRICE)) price = undefined;
  if (oldPrice != null && (oldPrice <= 0 || oldPrice > MAX_PRICE)) oldPrice = undefined;

  const currency =
    detectCurrency(priceText) ??
    detectCurrency(cardText) ??
    (priceText?.includes('€') || cardText.includes('€') ? 'EUR' : undefined);

  // --- url ------------------------------------------------------------------
  const productUrl = resolveAbsolute(pickProductLink($, card), opts.baseUrl);
  if (productUrl) sources.push('url:product_link');

  // --- image ----------------------------------------------------------------
  // Tilda exposes the canonical product image directly on the card via
  // `data-product-img`. Some other CMSes use `data-image-src`. Use those
  // first; fall back to the standard <img> attribute probe.
  const cardImgAttr =
    card.attr('data-product-img') ??
    card.attr('data-image-src') ??
    card.attr('data-img');
  const imageUrl =
    resolveAbsolute(cardImgAttr, opts.baseUrl) ??
    resolveAbsolute(
      pickImageAttr(
        card
          .find('img, .js-product-img, [data-original], meta[content*=".jpg"], meta[content*=".png"], meta[content*=".webp"]')
          .first(),
      ),
      opts.baseUrl,
    );
  if (imageUrl) sources.push(cardImgAttr ? 'image:card_data_attr' : 'image:img_tag');

  // --- availability / brand / rating / discount -----------------------------
  const availabilityFromText = detectAvailability(cardText) ?? 'unknown';
  const brand =
    txt(card.find('[itemprop="brand"], [class*="brand" i], [class*="marke" i]').first()) ||
    undefined;
  if (brand) sources.push('brand:tag');
  const sku = pickAttrOrText(card, ['data-sku', 'data-product-sku', 'data-article-id'], [
    '.js-product-sku',
    '.js-store-prod-sku',
    '[itemprop="sku"]',
    '[class*="sku" i]',
    '[class*="artikelnummer" i]',
    '[class*="article-number" i]',
  ]);
  if (sku) sources.push('sku:tag_or_attr');
  const ean = pickAttrOrText(card, ['data-ean'], [
    '[itemprop="ean"]',
    '[class*="ean" i]',
  ]);
  if (ean) sources.push('ean:tag_or_attr');
  const gtin = pickAttrOrText(card, ['data-gtin'], [
    '[itemprop="gtin"]',
    '[itemprop="gtin8"]',
    '[itemprop="gtin12"]',
    '[itemprop="gtin13"]',
    '[itemprop="gtin14"]',
    '[class*="gtin" i]',
  ]);
  if (gtin) sources.push('gtin:tag_or_attr');
  const r = rating(cardText);
  if (r != null) sources.push('rating:text');
  const dpct = discount(cardText);
  if (dpct != null) sources.push('discount:text');

  return {
    title,
    price,
    oldPrice,
    currency,
    productUrl,
    imageUrl,
    availability: availabilityFromText,
    brand,
    sku,
    ean,
    gtin,
    rating: r,
    discountPct: dpct,
    rawText: cardText.slice(0, 400),
    sourceSelectors: sources,
  };
}

export function isUsable(card: ExtractedCard): boolean {
  return Boolean(card.productUrl && (card.price != null || card.title));
}
