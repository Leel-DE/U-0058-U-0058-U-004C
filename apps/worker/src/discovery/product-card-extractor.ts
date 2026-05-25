import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { AnyNode } from 'domhandler';
import type { DiscoveryProduct } from './types.js';
import { detectAvailability, detectCurrency, parsePrice } from '../util/normalize.js';
import { normalizeUrl } from './url-normalizer.js';
import type { CategorySuggestion } from '../ai/schemas/category-suggestion.js';

type DomNode = AnyNode;

/**
 * Selectors used to discover product cards on a category/listing page.
 * Order does not matter — `pickCardSelector` keeps the one with the most
 * repeated matches. Cover both English and German conventions plus the
 * single most reliable signal: data-product-id / data-sku / data-article-id.
 */
const CARD_SELECTORS = [
  // Generic explicit product-identifier attributes — extremely reliable.
  '[data-product-id]',
  '[data-product-gen-uid]',
  '[data-variant-id]',
  '[data-sku]',
  '[data-article-id]',
  // Schema.org microdata
  '[itemtype*="Product"]',
  // English conventions
  '[data-testid*="product" i]',
  '[data-test*="product" i]',
  '[class*="product-card" i]',
  '.js-store-product',
  '.js-product[data-product-gen-uid]',
  '[class*="product-tile" i]',
  '[class*="product-item" i]',
  '[class*="product" i][class*="item" i]',
  // German conventions (fahrrad-xxl.de, otto.de, zalando.de, etc.)
  '[class*="artikel" i]',
  '[class*="produkt" i]',
  // Final fallback
  'article',
];

/**
 * Match ONE price token, anchored to a currency symbol so we never glue a
 * model-year ("Modeljahr 2026") or article number to the price digits.
 *
 * Accepted shapes:
 *   "\u20ac 1.299,00"     "\u20ac1299"     "1.299,00 \u20ac"     "1299,- \u20ac"
 *   "$1,299.99"      "1299.99 USD"   "\u00a399"        "199 GBP"
 *
 * What we explicitly disallow:
 *   "2026 1399.00"   \u2014 the old loose regex matched this as one number,
 *                      because [\d.\s]* permitted a space between digits.
 *   "20261399.00"    \u2014 model year glued to price by the site's HTML.
 */
const PRICE_RE =
  /(?:\u20ac|EUR|\$|USD|\u00a3|GBP|\u20b4|UAH|грн\.?)\s*([0-9]{1,6}(?:\s*[-–]\s*[0-9]{1,6})?(?:[.\u00a0\u202f]?[0-9]{3})*(?:[,.](?:[0-9]{1,2}|-))?)|([0-9]{1,6}(?:\s*[-–]\s*[0-9]{1,6})?(?:[.\u00a0\u202f]?[0-9]{3})*(?:[,.](?:[0-9]{1,2}|-))?)\s*(?:\u20ac|EUR|\$|USD|\u00a3|GBP|\u20b4|UAH|грн\.?)/i;
const PRICE_RE_GLOBAL = new RegExp(PRICE_RE.source, 'gi');

/** Highest plausible price for any single retail product (in major units).
 *  Anything above this is treated as a parsing error and discarded. */
const MAX_PLAUSIBLE_PRICE = 100_000;

function text(el: cheerio.Cheerio<DomNode>) {
  return el.text().replace(/\s+/g, ' ').trim();
}

function attr(el: cheerio.Cheerio<DomNode>, name: string) {
  return el.attr(name)?.trim() || undefined;
}

/** Strict per-price shape. Used to reject inputs like:
 *    "999999999,00 \u20ac"   (no thousands separators \u2014 runaway digit run)
 *    "2099.50 4199.00 \u20ac" (two prices fused)
 *  The shared `parsePrice` only looks at the leading 1\u20133 digits when no
 *  separator follows, so it silently truncates "999999999" to "999" and
 *  the MAX_PLAUSIBLE_PRICE cap then misses it. This regex anchors the
 *  whole string so any extra garbage causes a clean rejection. */
const SINGLE_PRICE_SHAPE =
  /^\s*(?:\u20ac|EUR|\$|USD|\u00a3|GBP|\u20b4|UAH|грн\.?)?\s*(?:\d{1,3}(?:[.,\s]\d{3})*(?:\s*[-–]\s*\d{1,6})?(?:[,.]\d{1,2}|,-)?|\d{1,6}(?:\s*[-–]\s*\d{1,6})?[,.]\d{1,2}|\d{1,6}(?:\s*[-–]\s*\d{1,6})?)\s*(?:\u20ac|EUR|\$|USD|\u00a3|GBP|\u20b4|UAH|грн\.?)?\s*$/i;

function parseVisiblePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!SINGLE_PRICE_SHAPE.test(trimmed)) return undefined;
  // Two adjacent currency symbols \u21d2 two prices stuck together \u21d2 reject.
  const currencyHits = trimmed.match(/\u20ac|EUR|\$|USD|\u00a3|GBP|\u20b4|UAH|грн\.?/gi)?.length ?? 0;
  if (currencyHits > 1) return undefined;
  // "1.999,-" / "1999,-" \u2192 integer euros, no cents
  if (/,-/.test(trimmed)) {
    const whole = trimmed.split(',-')[0]?.replace(/[^\d]/g, '');
    const value = whole ? Number(whole) : undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value > 0 && value <= MAX_PLAUSIBLE_PRICE ? value : undefined;
  }
  const value = parsePrice(trimmed);
  if (value == null) return undefined;
  if (value <= 0 || value > MAX_PLAUSIBLE_PRICE) return undefined;
  return value;
}

/** Pick a single price token out of the card's visible text, requiring a
 *  currency symbol nearby. Returns the first currency-anchored match. */
function firstAnchoredPriceText(haystack: string): string | undefined {
  const match = haystack.match(PRICE_RE);
  if (!match) return undefined;
  return match[0];
}

/** Return every currency-anchored price token in the card's visible text. */
function allAnchoredPrices(haystack: string): { raw: string; value: number }[] {
  const matches = haystack.match(PRICE_RE_GLOBAL) ?? [];
  return matches
    .map((raw) => ({ raw, value: parseVisiblePrice(raw) }))
    .filter((item): item is { raw: string; value: number } => item.value != null);
}

/**
 * Resolve an image URL against the page's base. We can NOT reuse the
 * discovery `normalizeUrl` here because it deliberately rejects binary
 * extensions (jpg/png/webp/…) — that's the right behaviour for crawl
 * candidates but the exact opposite of what we want for thumbnails.
 * This helper only does the relative→absolute resolution.
 */
function resolveImageUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || /^(?:data|javascript|mailto|tel):/i.test(trimmed)) return undefined;
  try {
    const u = new URL(trimmed, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function resolvePopupHook(card: cheerio.Cheerio<DomNode>, pageUrl: string): string | undefined {
  const hook = card.attr('data-tooltip-hook') ?? card.parents('[data-tooltip-hook]').first().attr('data-tooltip-hook');
  return resolveImageUrl(hook, pageUrl);
}

/** Lazy-load attributes some sites use instead of plain `src`. We probe in
 *  order: the most specific data-* names first, then fall back to the actual
 *  rendered `src` (which may be a placeholder pixel on lazy-loaded images). */
function pickImageUrl(el: cheerio.Cheerio<DomNode>): string | undefined {
  if (!el.length) return undefined;
  const tryAttrs = [
    'data-srcset',
    'data-src',
    'data-original',
    'data-lazy',
    'data-lazy-src',
    'data-image',
    'data-cy-img-src',
    'data-bg',
    'content',
    'srcset',
    'src',
  ];
  for (const a of tryAttrs) {
    const raw = el.attr(a)?.trim();
    if (!raw) continue;
    // srcset / data-srcset: "url1 1x, url2 2x" \u2014 take first non-empty URL.
    const first = raw.split(',')[0]?.trim().split(/\s+/)[0];
    if (!first) continue;
    if (/^data:image\//i.test(first)) continue; // skip inline placeholders
    return first;
  }
  return undefined;
}

function safeSelect($: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<DomNode> | null {
  try {
    return $(selector);
  } catch {
    return null;
  }
}

function safeFindWithin(card: cheerio.Cheerio<DomNode>, selector: string): cheerio.Cheerio<DomNode> {
  try {
    return card.find(selector).addBack(selector);
  } catch {
    return card.find('__cr_invalid_selector__');
  }
}

function pickCardSelector($: cheerio.CheerioAPI) {
  return CARD_SELECTORS.map((selector) => ({ selector, count: $(selector).length }))
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)[0]?.selector;
}

export function extractProductCards(html: string, pageUrl: string, categoryPath?: string, breadcrumbs: string[] = []): DiscoveryProduct[] {
  const $ = cheerio.load(html);
  const selector = pickCardSelector($);
  if (!selector) return [];
  const rootUrl = new URL(pageUrl).origin;
  const products: DiscoveryProduct[] = [];
  $(selector)
    .slice(0, 200)
    .each((_, node) => {
      const card = $(node);
      const linkEl = card.find('a[href]').filter((__, a) => {
        const href = $(a).attr('href') ?? '';
        return !/#|javascript:|mailto:|tel:/i.test(href);
      }).first();
      const popupUrl = resolvePopupHook(card, pageUrl);
      const url = popupUrl ?? normalizeUrl(attr(linkEl, 'href'), { rootUrl, baseUrl: pageUrl });
      if (!url) return;
      const title =
        text(card.find('[itemprop="name"], [data-testid*="title" i], [data-test*="title" i], .js-product-name, .t750__title, h2, h3').first()) ||
        attr(card.find('img').first(), 'alt') ||
        text(linkEl);
      // Look for the EXPLICIT current-price element first. Many sites split
      // sale/RRP into two siblings (.price--special / .price--old, <ins>/<del>).
      const cardText = text(card);
      const explicitCurrent = text(
        card
          .find(
            '[itemprop="price"], ' +
              '[data-testid*="price-current" i], [data-testid*="current-price" i], ' +
              '.js-store-prod-price, .js-store-prod-price-val, .js-product-price, .t750__price, .t750__price-value, ' +
              '[class*="price--special" i], [class*="price--sale" i], [class*="price--current" i], ' +
              '[class*="price-current" i], [class*="sale-price" i], ' +
              'ins[class*="price" i]',
          )
          .first(),
      );
      const explicitOld = text(
        card
          .find(
              '.js-store-prod-price-old, .js-store-prod-price-old-val, .t750__price_old, ' +
              '[class*="price--old" i], [class*="old-price" i], [class*="price--was" i], ' +
              '[class*="was-price" i], [class*="rrp" i], del[class*="price" i], s[class*="price" i]',
          )
          .first(),
      );
      const explicitPrice = text(
        card
          .find('[data-testid*="price" i], [data-test*="price" i], [class*="price" i]')
          .not('[class*="--old" i], [class*="-old" i], [class*="was" i], [class*="rrp" i]')
          .first(),
      );

      const priceText =
        explicitCurrent ||
        explicitPrice ||
        firstAnchoredPriceText(cardText);

      let price = parseVisiblePrice(priceText);

      // Build the candidate list from the card text but ONLY accept
      // currency-anchored tokens. This is what stops "Modeljahr 2026 ab
      // 1399,- €" from yielding the bogus pair 2026/1399.
      const allPrices = allAnchoredPrices(cardText);

      if (price == null) price = allPrices[0]?.value;

      // Old price: prefer the explicit old-price element. Otherwise pick the
      // largest anchored price that is strictly bigger than the current one
      // AND within a sensible "sale headroom" (no more than 10× current).
      let oldPrice = parseVisiblePrice(explicitOld);
      if (oldPrice == null && price != null) {
        const cand = allPrices
          .filter((p) => p.value > price! && p.value <= price! * 10)
          .sort((a, b) => b.value - a.value)[0];
        oldPrice = cand?.value;
      }

      // Final sanity cap (parseVisiblePrice already enforces it but be explicit).
      if (price != null && (price <= 0 || price > MAX_PLAUSIBLE_PRICE)) price = undefined;
      if (oldPrice != null && (oldPrice <= 0 || oldPrice > MAX_PLAUSIBLE_PRICE)) oldPrice = undefined;
      // If after all that oldPrice is still <= price, drop it (not a discount).
      if (price != null && oldPrice != null && oldPrice <= price) oldPrice = undefined;

      const imageEl = card
        .find('img, .js-product-img, [data-original], meta[content*=".jpg"], meta[content*=".png"], meta[content*=".webp"]')
        .first();
      const imageUrl = resolveImageUrl(pickImageUrl(imageEl), pageUrl);
      products.push({
        id: randomUUID(),
        url,
        normalizedUrl: url,
        title: title || undefined,
        price,
        oldPrice,
        currency: detectCurrency(priceText),
        availability: detectAvailability(text(card)) ?? 'unknown',
        imageUrl,
        brand: text(card.find('[itemprop="brand"], [class*="brand" i]').first()) || undefined,
        categoryPath,
        categoryUrl: pageUrl,
        breadcrumbs,
        sourcePageUrl: pageUrl,
        rawCardJson: { selector, priceText },
        confidence: title && price != null ? 0.85 : title || price != null ? 0.55 : 0.25,
        source: 'category_card',
        errors: title && price != null ? [] : ['incomplete_card'],
      });
    });
  return products;
}

export function extractProductCardsWithSelectors(
  html: string,
  pageUrl: string,
  suggestion: CategorySuggestion,
  categoryPath?: string,
  breadcrumbs: string[] = [],
): DiscoveryProduct[] {
  const $ = cheerio.load(html);
  if (!suggestion.productCardSelector) return [];
  const cards = safeSelect($, suggestion.productCardSelector);
  if (!cards) return [];
  const rootUrl = new URL(pageUrl).origin;
  const products: DiscoveryProduct[] = [];
  cards
    .slice(0, 200)
    .each((_, node) => {
      const card = $(node);
      const usesPopupHook = suggestion.cardLinkSelector === '[data-tooltip-hook]';
      const linkEl =
        suggestion.cardLinkSelector && !usesPopupHook
          ? safeFindWithin(card, suggestion.cardLinkSelector).first()
          : card.find('a[href]').first();
      const url = usesPopupHook
        ? resolvePopupHook(card, pageUrl)
        : normalizeUrl(attr(linkEl, 'href'), { rootUrl, baseUrl: pageUrl });
      if (!url) return;
      const title = suggestion.cardTitleSelector ? text(safeFindWithin(card, suggestion.cardTitleSelector).first()) : text(linkEl);
      const priceText = suggestion.cardPriceSelector ? text(safeFindWithin(card, suggestion.cardPriceSelector).first()) : undefined;
      const oldPriceText = suggestion.cardOldPriceSelector ? text(safeFindWithin(card, suggestion.cardOldPriceSelector).first()) : undefined;
      const availabilityText = suggestion.cardAvailabilitySelector
        ? text(safeFindWithin(card, suggestion.cardAvailabilitySelector).first())
        : undefined;
      const imageEl = suggestion.cardImageSelector ? safeFindWithin(card, suggestion.cardImageSelector).first() : card.find('img').first();
      const imageUrl = resolveImageUrl(pickImageUrl(imageEl), pageUrl);
      const price = parseVisiblePrice(priceText);
      const oldPrice = parseVisiblePrice(oldPriceText);
      products.push({
        id: randomUUID(),
        url,
        normalizedUrl: url,
        title: title || undefined,
        price,
        oldPrice: oldPrice != null && price != null && oldPrice > price ? oldPrice : undefined,
        currency: detectCurrency(priceText) ?? detectCurrency(oldPriceText),
        availability: detectAvailability(availabilityText) ?? 'unknown',
        imageUrl,
        categoryPath,
        categoryUrl: pageUrl,
        breadcrumbs,
        sourcePageUrl: pageUrl,
        rawCardJson: { aiSuggestion: suggestion, priceText, oldPriceText },
        confidence: title && price != null ? Math.min(0.9, suggestion.confidence) : Math.min(0.6, suggestion.confidence),
        source: 'ai_assisted',
        errors: title && price != null ? [] : ['incomplete_card'],
      });
    });
  return products;
}
