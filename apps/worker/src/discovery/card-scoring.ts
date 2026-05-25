/**
 * Pure scoring engine for product-card detection.
 *
 * Given a cheerio element, returns a numeric score with a breakdown of which
 * positive signals and which penalties contributed. No DOM mutation, no I/O.
 *
 * Score ranges (consumed by product-card-detector):
 *   >= 60  → accepted as product card
 *   40-59  → "possible" (kept only if its repeated-signature siblings also score well)
 *   < 40   → rejected
 */
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
type DomNode = AnyNode;

export interface ScoreBreakdown {
  score: number;
  signals: string[];
  rejections: string[];
}

/** Regexes for visible-price detection inside a candidate element.
 *  IMPORTANT: `\b` won't match between two non-word chars (e.g. space and
 *  `$`/`€`/`£`/`₽`), so currency-prefixed forms drop `\b` before the symbol. */
const PRICE_PATTERNS: RegExp[] = [
  // EUR / USD / GBP — value first
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:€|EUR)\b/i,
  /(?:€|EUR)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b/i,
  /\b(?:ab|from)\s+\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s?(?:€|EUR)\b/i,
  /\bUVP\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s?(?:€|EUR)\b/i,
  /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,
  /£\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/,
  /\b\d{1,3}(?:,\d{3})*\.\d{2}\s?(?:USD|GBP)\b/i,
  /\b\d{1,3}(?:[.,]\d{3})*\s?(?:€|EUR|\$|USD|£|GBP)\b/i,
  // RUB / UAH / KZT / PLN / CZK / CHF — used heavily by CIS / EU stores.
  // Trailing `\b` is dropped because the symbol is non-word and `\b` won't
  // match between two non-word chars (₽ + end-of-string).
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:₽|RUB|руб\.?|р\.)/i,
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:грн\.?|₴|UAH)/i,
  /\b\d{1,6}(?:\s*[-–]\s*\d{1,6})?(?:[.,]\d{1,2})?\s?(?:грн\.?|₴|UAH)\b/i,
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:₸|тг|KZT)/i,
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:zł|PLN)/i,
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:Kč|CZK)/i,
  /\b\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?\s?(?:CHF|Fr\.)/i,
];

/** Class/id/attr tokens that strongly hint "product card" in EN/DE shops. */
export const PRODUCT_CLASS_HINTS: ReadonlyArray<string> = [
  'product-card',
  'product-item',
  'product-tile',
  'product-box',
  'product-grid-item',
  'product-list-item',
  'product-wrapper',
  'product-container',
  'product-miniature',
  'product-thumb',
  'product-layout',
  'product-small',
  'product-pod',
  'product-block',
  'item-product',
  'item-card',
  'js-product',
  'c-product',
  'm-product',
  'teaser-product',
  'woocommerce-LoopProduct-link',
  'catalog-item',
  'catalogue-item',
  'shop-item',
  'good-item',
  'goods',
  'offer-item',
  'tile',
  'card',
  'listing-item',
  'grid-item',
  // German
  'artikel',
  'artikelbox',
  'artikel-card',
  'produkt',
  'produktbox',
  'produkt-card',
  'produktliste',
  'kachel',
  // Tilda (popular Russian/CIS site builder — olinbar.tools, etc.)
  // The list-item wrapper is `js-product t-store__card t-store__stretch-col …`,
  // and inner text/btn wrappers carry `t-store__card_textwrapper`,
  // `t-store__card_wrap_txt-and-btns`, `t-store__card__btns-wrapper`.
  't-store__card',
  't-store__card_textwrapper',
  't-store__card_wrap_txt-and-btns',
  't-store__card_wrap_all',
  't-store__card_btns-wrapper',
  't-store__card__btns-wrapper',
  't-store-card',
  'js-product',
  'js-store-product',
  'js-store-product_single',
  // InSales / WordPress Storefront / OpenCart short forms
  'js-catalog-item',
  'js-item-product',
  'storefront-product',
  'opencart-product',
];

/** Data-* attributes that almost always mark a single product card. */
export const PRODUCT_DATA_ATTRS: ReadonlyArray<string> = [
  'data-product-id',
  'data-product',
  'data-product-sku',
  'data-sku',
  'data-variant-id',
  'data-article-id',
  'data-ean',
  'data-gtm-product',
  'data-item-id',
  // Tilda — these appear on every Tilda product card.
  'data-product-lid',
  'data-product-uid',
  'data-product-gen-uid',
  'data-product-part-uid',
  'data-product-url',
  'data-product-img',
  'data-product-inv',
  'data-card-size',
  // Common variants on other CMSes
  'data-product-handle',
  'data-product-name',
  'data-itemid',
];

/** Class tokens that should reject the element no matter what. */
const NOISE_CLASS_HINTS: ReadonlyArray<string> = [
  'header',
  'footer',
  'nav',
  'navigation',
  'breadcrumb',
  'menu',
  'cookie',
  'banner',
  'modal',
  'popup',
  'newsletter',
  'overlay',
  'sidebar-account',
  'cart-drawer',
  'login',
  'register',
];

const ACTION_HINTS: ReadonlyArray<RegExp> = [
  /\badd[\s_-]?to[\s_-]?cart\b/i,
  /\bin den warenkorb\b/i,
  /\bzum warenkorb\b/i,
  /\bjetzt kaufen\b/i,
  /\bbuy now\b/i,
  /\bkaufen\b/i,
  /\bzum produkt\b/i,
  /\bdetails ansehen\b/i,
  /\bmehr erfahren\b/i,
];

const AVAILABILITY_HINTS: ReadonlyArray<RegExp> = [
  /\bin stock\b/i,
  /\bout of stock\b/i,
  /\bsofort verf[üu]gbar\b/i,
  /\bauf lager\b/i,
  /\blieferbar\b/i,
  /\bnicht lieferbar\b/i,
  /\bverf[üu]gbar\b/i,
  /\bausverkauft\b/i,
  /\bvorbestellen\b/i,
];

const RATING_HINTS: ReadonlyArray<RegExp> = [
  /\b\d(?:[.,]\d)?\s?\/\s?5\b/,
  /\b\d+\s?(?:bewertungen|reviews|sterne|stars)\b/i,
];

const DISCOUNT_HINTS: ReadonlyArray<RegExp> = [
  /\b-?\d{1,2}\s?%\b/,
  /\b(sale|rabatt|reduziert|sparen|angebot|discount)\b/i,
];

/** Class tokens used on price elements (boost when present). */
const PRICE_CLASS_HINTS: ReadonlyArray<string> = [
  'price',
  'preis',
  'amount',
  'money',
  'current-price',
  'sale-price',
  'regular-price',
  'final-price',
  'uvp',
];

function classTokens(el: Cheerio<DomNode>): string[] {
  const cls = (el.attr('class') ?? '').toLowerCase();
  const id = (el.attr('id') ?? '').toLowerCase();
  return [...cls.split(/\s+/), id].filter(Boolean);
}

function hasAnyToken(tokens: string[], needles: ReadonlyArray<string>): string | undefined {
  for (const t of tokens) {
    for (const n of needles) {
      if (t.includes(n)) return n;
    }
  }
  return undefined;
}

function hasAnyDataAttr(el: Cheerio<DomNode>, names: ReadonlyArray<string>): string | undefined {
  for (const n of names) {
    const v = el.attr(n);
    if (v && v.trim().length > 0) return n;
  }
  return undefined;
}

function hasValidPriceText(text: string): boolean {
  return PRICE_PATTERNS.some((re) => re.test(text));
}

function looksLikeProductHref(href: string | undefined | null): boolean {
  if (!href) return false;
  if (/^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) return false;
  if (/\/(?:cart|checkout|login|signin|register|account|wishlist|compare|search|filter)(?:\/|$|\?)/i.test(href)) {
    return false;
  }
  if (/\/(?:product|products|produkt|p|item|artikel|shop|bike|e-bike|fahrrad)\//i.test(href)) {
    return true;
  }
  if (/-(?:p|sku|art|item)\d+(?:\.html|\/)?$/i.test(href)) return true;
  if (/-m\d{5,}/i.test(href)) return true; // fahrrad-xxl: -m000104574
  if (/\.html?(?:\?|$)/i.test(href) && href.length > 25) return true;
  return false;
}

function isHiddenStyle(style: string | undefined | null): boolean {
  if (!style) return false;
  const s = style.replace(/\s+/g, '').toLowerCase();
  return /display:none|visibility:hidden|opacity:0/.test(s);
}

function nodeSize(el: Cheerio<DomNode>): number {
  return el.find('*').length;
}

function visibleTextLength(el: Cheerio<DomNode>): number {
  return el.text().replace(/\s+/g, ' ').trim().length;
}

function imageLooksLikeProduct(img: Cheerio<DomNode>): boolean {
  const cls = (img.attr('class') ?? '').toLowerCase();
  if (/\b(logo|icon|sprite|payment|social|tracking|pixel|favicon)\b/.test(cls)) return false;
  const alt = (img.attr('alt') ?? '').trim();
  if (/^(?:logo|icon|menu|search|cart|warenkorb)$/i.test(alt)) return false;
  const w = Number(img.attr('width'));
  const h = Number(img.attr('height'));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w < 40 && h < 40) {
    return false;
  }
  const src =
    img.attr('data-src') ??
    img.attr('data-original') ??
    img.attr('data-lazy-src') ??
    img.attr('srcset') ??
    img.attr('data-srcset') ??
    img.attr('src');
  return Boolean(src && !/^data:image\//i.test(src));
}

function titleLikeText(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 250) return false;
  // Must include at least one letter; not just digits.
  if (!/[a-zäöüß]/i.test(t)) return false;
  return true;
}

function ancestorIsNoise($: CheerioAPI, el: Cheerio<DomNode>): string | undefined {
  const className = el.attr('class') ?? '';
  if (/\b(?:js-product|js-store-product|js-store-product_single)\b/.test(className)) return undefined;
  const ancestors = el.parents('header, footer, nav, [class*="header" i], [class*="footer" i], [role="navigation"], [class*="cookie" i], [class*="modal" i], [class*="popup" i], [class*="newsletter" i]');
  if (ancestors.length === 0) return undefined;
  const first = ancestors.first();
  const cls = (first.attr('class') ?? '').toLowerCase();
  const tag = (first.get(0) as { tagName?: string })?.tagName?.toLowerCase() ?? 'node';
  return `${tag}${cls ? '.' + cls.split(/\s+/)[0] : ''}`;
}

function ancestorIsHidden(el: Cheerio<DomNode>): boolean {
  return el.parents().toArray().some((parent) => {
    const attrs = (parent as { attribs?: Record<string, string | undefined> }).attribs ?? {};
    return (
      isHiddenStyle(attrs.style) ||
      attrs['aria-hidden'] === 'true' ||
      attrs.hidden !== undefined
    );
  });
}

export function scoreCandidate($: CheerioAPI, el: Cheerio<DomNode>): ScoreBreakdown {
  const signals: string[] = [];
  const rejections: string[] = [];
  let score = 0;

  // ---- Visibility / hidden-by-style ---------------------------------------
  if (isHiddenStyle(el.attr('style'))) {
    score -= 50;
    rejections.push('hidden_inline_style');
  }
  if (el.attr('aria-hidden') === 'true') {
    score -= 15;
    rejections.push('aria_hidden');
  }
  if (el.attr('hidden') !== undefined) {
    score -= 15;
    rejections.push('hidden_attr');
  }
  if (ancestorIsHidden(el)) {
    score -= 50;
    rejections.push('hidden_ancestor');
  }

  // ---- Ancestor noise -----------------------------------------------------
  const noiseAncestor = ancestorIsNoise($, el);
  if (noiseAncestor) {
    score -= 30;
    rejections.push(`in_noise_ancestor:${noiseAncestor}`);
  }

  // ---- Class / data-* hints ----------------------------------------------
  const tokens = classTokens(el);
  const productClassHit = hasAnyToken(tokens, PRODUCT_CLASS_HINTS);
  if (productClassHit) {
    score += 15;
    signals.push(`class_hint:${productClassHit}`);
  }
  const noiseClassHit = hasAnyToken(tokens, NOISE_CLASS_HINTS);
  if (noiseClassHit && !productClassHit) {
    score -= 30;
    rejections.push(`noise_class:${noiseClassHit}`);
  }
  const dataAttrHit = hasAnyDataAttr(el, PRODUCT_DATA_ATTRS);
  if (dataAttrHit) {
    score += 20;
    signals.push(`data_attr:${dataAttrHit}`);
  }

  // ---- Schema.org microdata ----------------------------------------------
  const itemtype = el.attr('itemtype') ?? '';
  if (/schema\.org\/Product\b/i.test(itemtype) || /schema\.org\/Offer\b/i.test(itemtype)) {
    score += 50;
    signals.push('schema_product');
  } else if (el.find('[itemtype*="schema.org/Product" i], [itemtype*="schema.org/Offer" i]').length > 0) {
    score += 25;
    signals.push('contains_schema_product');
  }
  if (el.find('[itemprop="price"], [itemprop="offers"]').length > 0) {
    score += 10;
    signals.push('itemprop_price_or_offers');
  }

  // ---- Price text ---------------------------------------------------------
  const text = el.text();
  if (hasValidPriceText(text)) {
    score += 30;
    signals.push('valid_price_text');
  }
  const priceEl = el.find('[itemprop="price"], [class*="price" i], [class*="preis" i], [class*="amount" i]');
  if (priceEl.length > 0) {
    const priceElText = priceEl.first().text();
    if (hasValidPriceText(priceElText)) {
      score += 10;
      signals.push('explicit_price_element');
    }
    const priceCls = (priceEl.first().attr('class') ?? '').toLowerCase();
    if (PRICE_CLASS_HINTS.some((h) => priceCls.includes(h))) {
      score += 3;
      signals.push('price_class_hint');
    }
  }

  // ---- Product-link signal ------------------------------------------------
  const productLinks = el.find('a[href]').toArray().filter((a) => {
    const href = ($(a).attr('href') ?? '').trim();
    return looksLikeProductHref(href);
  });
  if (productLinks.length > 0) {
    score += 25;
    signals.push(`product_link(${productLinks.length})`);
  }
  // Too many internal links = it's probably a nav/menu, not a card.
  const totalLinks = el.find('a[href]').length;
  if (totalLinks > 20) {
    score -= 20;
    rejections.push(`too_many_links:${totalLinks}`);
  }

  // ---- Image signal -------------------------------------------------------
  const img = el.find('img').filter((_, i) => imageLooksLikeProduct($(i))).first();
  if (img.length > 0) {
    score += 20;
    signals.push('product_image');
  }

  // ---- Title-like text ----------------------------------------------------
  const titleEl = el
    .find(
      '[itemprop="name"], [data-testid*="title" i], [data-testid*="name" i], h2, h3, h4, ' +
        '[class*="title" i], [class*="name" i]',
    )
    .first();
  const titleText = titleEl.text().trim();
  if (titleText && titleLikeText(titleText)) {
    score += 15;
    signals.push('title_element');
  }

  // ---- Action / availability / rating / discount --------------------------
  if (ACTION_HINTS.some((re) => re.test(text))) {
    score += 10;
    signals.push('action_text');
  }
  if (AVAILABILITY_HINTS.some((re) => re.test(text))) {
    score += 8;
    signals.push('availability_text');
  }
  if (RATING_HINTS.some((re) => re.test(text)) || el.find('[class*="rating" i], [class*="stars" i], [class*="bewertung" i]').length > 0) {
    score += 5;
    signals.push('rating');
  }
  if (DISCOUNT_HINTS.some((re) => re.test(text)) || el.find('[class*="sale" i], [class*="badge" i], [class*="rabatt" i]').length > 0) {
    score += 5;
    signals.push('discount_badge');
  }

  // ---- Size guards --------------------------------------------------------
  const descendants = nodeSize(el);
  if (descendants > 250) {
    score -= 25;
    rejections.push(`too_large:${descendants}`);
  }
  const textLen = visibleTextLength(el);
  if (textLen < 5) {
    score -= 20;
    rejections.push('no_text');
  }

  // ---- Hard "not a card" guards ------------------------------------------
  // Only apply the price-or-schema penalty if NOTHING product-y is present:
  // no price signal, no schema, no data-*, no (image + title) pair, no
  // (product link + image), and no price-class hint with image. This way
  // a Magento <li> with image + .price-wrapper + product-item-link still
  // counts as a card even though there's no €/$ literal text in it.
  const hasPriceLikeSignal =
    signals.includes('valid_price_text') ||
    signals.includes('explicit_price_element') ||
    signals.includes('price_class_hint') ||
    signals.includes('itemprop_price_or_offers');
  const hasSchema =
    signals.includes('schema_product') || signals.includes('contains_schema_product');
  const hasDataAttr = signals.some((s) => s.startsWith('data_attr:'));
  const hasImage = signals.includes('product_image');
  const hasTitle = signals.includes('title_element');
  const hasProductLink = signals.some((s) => s.startsWith('product_link'));
  const cardLikeCombo =
    (hasImage && hasTitle) || (hasImage && hasProductLink) || (hasImage && hasPriceLikeSignal);

  if (!hasPriceLikeSignal && !hasSchema && !hasDataAttr && !cardLikeCombo) {
    score -= 30;
    rejections.push('no_price_no_schema_no_data_attr');
  }

  return { score, signals, rejections };
}

export interface ClassifyResult {
  decision: 'accept' | 'possible' | 'reject';
  score: number;
  signals: string[];
  rejections: string[];
}

export const ACCEPT_THRESHOLD = 60;
export const POSSIBLE_THRESHOLD = 40;

export function classify(breakdown: ScoreBreakdown): ClassifyResult {
  if (breakdown.rejections.some((item) => item.startsWith('hidden_'))) {
    return { decision: 'reject', ...breakdown };
  }
  if (breakdown.score >= ACCEPT_THRESHOLD) {
    return { decision: 'accept', ...breakdown };
  }
  if (breakdown.score >= POSSIBLE_THRESHOLD) {
    return { decision: 'possible', ...breakdown };
  }
  return { decision: 'reject', ...breakdown };
}
