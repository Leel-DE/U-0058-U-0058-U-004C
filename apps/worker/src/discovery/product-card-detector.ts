/**
 * Robust product-card detector.
 *
 * Pipeline (each step is optional; first one with enough confidence wins,
 * later steps can still augment the result):
 *
 *   1. structured-data-extractor   → JSON-LD ItemList / Product
 *   2. js-payload-extractor        → __NEXT_DATA__, ShopifyAnalytics, etc.
 *   3. DOM scoring                 → score every candidate, group by
 *                                    structural signature, dedupe nested,
 *                                    extract fields
 *   4. Combine                     → return a single `DetectedGrid` with
 *                                    cards + grid/card selectors + confidence
 *                                    + stats + structured logs.
 *
 * Design rules:
 *   - Pure function. No I/O, no Playwright, no AI.
 *   - Read-only on the input HTML.
 *   - Never throws on malformed HTML — returns an empty result instead.
 *   - Every accept/reject decision is captured in `logs` so the runner can
 *     surface "card #5 rejected: no_price_no_schema_no_data_attr" upstream.
 */
import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from "domhandler";
type DomNode = AnyNode;
import {
  ACCEPT_THRESHOLD,
  PRODUCT_CLASS_HINTS,
  PRODUCT_DATA_ATTRS,
  classify,
  scoreCandidate,
  type ClassifyResult,
  type ScoreBreakdown,
} from './card-scoring.js';
import { groupBySignature, selectorForGroup, signatureOf } from './card-signature.js';
import { extractFields, isUsable, type ExtractedCard } from './field-extractor.js';
import {
  extractStructuredProducts,
  type StructuredProduct,
} from './structured-data-extractor.js';
import {
  extractFromPayloads,
  type PayloadProduct,
  type PayloadResult,
} from './js-payload-extractor.js';

export interface DetectedCard extends ExtractedCard {
  selector: string;
  signature: string;
  signals: string[];
  score: number;
  confidence: number;
  decision: 'accept' | 'possible';
  source: 'dom' | 'json-ld' | PayloadResult['source'];
}

export interface DetectorLogEntry {
  level: 'info' | 'warn';
  message: string;
  context?: Record<string, unknown>;
}

export interface DetectionStats {
  candidateCount: number;
  acceptedCount: number;
  possibleCount: number;
  rejectedCount: number;
  structuredProducts: number;
  payloadProducts: number;
}

export interface DetectionResult {
  cards: DetectedCard[];
  gridSelector: string | null;
  cardSelector: string | null;
  confidence: number;
  stats: DetectionStats;
  logs: DetectorLogEntry[];
}

const NOISE_SELECTORS = 'script, style, noscript, svg, template, link, meta';
const STRUCTURAL_NOISE = 'header, footer, nav[role="navigation"], [role="banner"], [role="contentinfo"]';

/** Build the initial candidate list: every element that has at least one
 *  reason to be considered. We over-include on purpose — scoring will filter. */
function gatherCandidates($: CheerioAPI): Cheerio<DomNode>[] {
  const seen = new Set<DomNode>();
  const out: Cheerio<DomNode>[] = [];

  const selectors = [
    // explicit
    '[itemtype*="schema.org/Product" i]',
    '[itemtype*="schema.org/Offer" i]',
    ...PRODUCT_DATA_ATTRS.map((a) => `[${a}]`),
    ...PRODUCT_CLASS_HINTS.map((h) => `[class*="${h}" i]`),
    // semantic
    'article',
    'li',
  ];

  for (const sel of selectors) {
    try {
      $(sel).each((_, el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        out.push($(el));
      });
    } catch {
      // invalid selector – skip
    }
  }

  // Generic-div fallback: catch sites that use bare <div> with no helpful
  // classes. We restrict to divs that contain BOTH an <a> and an <img>,
  // which keeps the candidate pool reasonable while still covering plain-
  // div product grids.
  $('div').each((_, el) => {
    if (!el || seen.has(el)) return;
    const node = $(el);
    if (node.find('a[href]').length === 0) return;
    if (node.find('img').length === 0) return;
    if (node.find('*').length > 60) return;
    seen.add(el);
    out.push(node);
  });

  return out;
}

/** Remove elements that are inside script/style/svg/header/footer/etc. */
function stripNoise($: CheerioAPI): void {
  $(NOISE_SELECTORS).remove();
  // Also remove obvious structural noise (header/footer/nav).
  $(STRUCTURAL_NOISE).remove();
  // Common cookie banners / modals / newsletter overlays.
  $('[class*="cookie" i], [class*="modal" i], [class*="popup" i], [class*="newsletter" i], [class*="overlay" i]').each((_, el) => {
    const node = $(el);
    if (node.is('.js-product, .js-store-product') || node.find('.js-product, .js-store-product').length > 0) return;
    node.remove();
  });
}

interface ScoredCandidate {
  el: Cheerio<DomNode>;
  classified: ClassifyResult;
  signature: string;
}

function applyGroupBoost(grouped: { signature: string; members: ScoredCandidate[] }[]): void {
  for (const g of grouped) {
    if (g.members.length < 3) continue;
    // Repeated structural pattern with 3+ siblings → almost certainly a grid.
    for (const m of g.members) {
      m.classified.score += 15;
      m.classified.signals.push(`repeated_signature(${g.members.length})`);
      // Promote borderline candidates up to accept.
      if (m.classified.decision === 'possible' && m.classified.score >= ACCEPT_THRESHOLD) {
        m.classified.decision = 'accept';
      }
    }
  }
}

/** Is element B a descendant of element A? Walks B's parent chain — safer
 *  than `a.find(b)` here because the latter requires Cheerio<Element> and
 *  we hold the looser Cheerio<AnyNode>. */
function aContainsB(a: Cheerio<DomNode>, b: Cheerio<DomNode>): boolean {
  const aRoot = a.get(0);
  const bRoot = b.get(0);
  if (!aRoot || !bRoot || aRoot === bRoot) return false;
  let cur: { parent?: unknown } | null = bRoot as unknown as { parent?: unknown };
  while (cur?.parent) {
    if (cur.parent === aRoot) return true;
    cur = cur.parent as { parent?: unknown } | null;
  }
  return false;
}

function hasSignal(s: ScoredCandidate, prefix: string): boolean {
  return s.classified.signals.some((signal) => signal === prefix || signal.startsWith(prefix));
}

function hasFullCardSignals(s: ScoredCandidate): boolean {
  const hasSchema = hasSignal(s, 'schema_product') || hasSignal(s, 'contains_schema_product');
  const hasDataAttr = s.classified.signals.some((signal) => signal.startsWith('data_attr:'));
  const hasProductLink = s.classified.signals.some((signal) => signal.startsWith('product_link'));
  const hasImage = hasSignal(s, 'product_image');
  const hasTitle = hasSignal(s, 'title_element');
  const hasPrice =
    hasSignal(s, 'valid_price_text') ||
    hasSignal(s, 'explicit_price_element') ||
    hasSignal(s, 'itemprop_price_or_offers') ||
    hasSignal(s, 'price_class_hint');

  const className = s.el.attr('class') ?? '';
  const isTildaPopupProduct = /\b(?:js-product|js-store-product|js-store-product_single)\b/.test(className);

  return (
    hasSchema ||
    (hasProductLink && hasImage && (hasPrice || hasTitle)) ||
    (hasDataAttr && hasImage && (hasPrice || hasTitle)) ||
    (isTildaPopupProduct && hasDataAttr && hasPrice && hasTitle)
  );
}

/** If parent and child both scored, keep the smaller one (more specific) but
 *  only when the child carries enough product signals itself. A bare price
 *  node can score highly, but it is not a card and must not delete its parent. */
function dedupeNested(scored: ScoredCandidate[]): ScoredCandidate[] {
  const keep = new Set(scored);
  for (const a of scored) {
    if (!keep.has(a)) continue;
    for (const b of scored) {
      if (a === b || !keep.has(b)) continue;
      if (aContainsB(a.el, b.el)) {
        if (hasFullCardSignals(b)) {
          keep.delete(a);
        }
        break;
      }
    }
  }
  return scored.filter((s) => keep.has(s));
}

function uniqByUrl(cards: DetectedCard[]): DetectedCard[] {
  const seen = new Set<string>();
  const out: DetectedCard[] = [];
  for (const c of cards) {
    const key = c.productUrl ?? `${c.title ?? ''}|${c.price ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function structuredToDetected(p: StructuredProduct, baseUrl: string): DetectedCard {
  return {
    selector: '[itemtype*="schema.org/Product" i]',
    signature: 'json-ld',
    signals: ['schema_product', 'json-ld'],
    score: 100,
    confidence: 0.95,
    decision: 'accept',
    source: 'json-ld',
    title: p.title,
    price: p.price,
    oldPrice: p.oldPrice,
    currency: p.currency,
    productUrl: p.productUrl ? safeResolve(p.productUrl, baseUrl) : undefined,
    imageUrl: p.imageUrl ? safeResolve(p.imageUrl, baseUrl) : undefined,
    availability: (p.availability as ExtractedCard['availability']) ?? 'unknown',
    brand: p.brand,
    sku: p.sku,
    gtin: p.gtin,
    rating: p.rating,
    sourceSelectors: ['json-ld'],
  };
}

function payloadToDetected(p: PayloadProduct, baseUrl: string, source: PayloadResult['source']): DetectedCard {
  return {
    selector: `payload:${source}`,
    signature: `payload:${source}`,
    signals: [`payload_${source}`],
    score: 80,
    confidence: 0.85,
    decision: 'accept',
    source,
    title: p.title,
    price: p.price,
    currency: p.currency,
    productUrl: p.productUrl ? safeResolve(p.productUrl, baseUrl) : undefined,
    imageUrl: p.imageUrl ? safeResolve(p.imageUrl, baseUrl) : undefined,
    availability: 'unknown',
    brand: p.brand,
    sku: p.sku,
    ean: p.ean,
    gtin: p.gtin,
    sourceSelectors: [`payload:${source}`],
  };
}

function safeResolve(href: string, baseUrl: string): string | undefined {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export interface DetectOptions {
  /** Absolute URL of the page the HTML came from. Used to resolve relative URLs. */
  pageUrl: string;
}

export function detectProductCards(html: string, opts: DetectOptions): DetectionResult {
  const logs: DetectorLogEntry[] = [];
  const stats: DetectionStats = {
    candidateCount: 0,
    acceptedCount: 0,
    possibleCount: 0,
    rejectedCount: 0,
    structuredProducts: 0,
    payloadProducts: 0,
  };

  // ---- Step 1: structured data --------------------------------------------
  const structured = extractStructuredProducts(html);
  stats.structuredProducts = structured.length;
  const structuredCards = structured.map((p) => structuredToDetected(p, opts.pageUrl));

  // ---- Step 2: framework JSON payloads ------------------------------------
  const payloadResults = extractFromPayloads(html);
  const payloadCards: DetectedCard[] = [];
  for (const r of payloadResults) {
    for (const p of r.products) payloadCards.push(payloadToDetected(p, opts.pageUrl, r.source));
  }
  stats.payloadProducts = payloadCards.length;
  if (payloadCards.length > 0) {
    logs.push({
      level: 'info',
      message: `JS payload sources detected: ${payloadResults.map((r) => `${r.source}(${r.products.length})`).join(', ')}`,
    });
  }
  if (structuredCards.length > 0) {
    logs.push({
      level: 'info',
      message: `JSON-LD found ${structuredCards.length} structured product(s)`,
    });
  }

  // ---- Step 3: DOM scoring ------------------------------------------------
  const $ = cheerio.load(html);
  stripNoise($);

  const candidates = gatherCandidates($);
  stats.candidateCount = candidates.length;

  const scored: ScoredCandidate[] = candidates.map((el) => {
    const breakdown: ScoreBreakdown = scoreCandidate($, el);
    return {
      el,
      classified: classify(breakdown),
      signature: signatureOf(el),
    };
  });

  // Group by structural signature, boost repeated patterns.
  const grouped = groupBySignature(scored, (s) => s.signature);
  applyGroupBoost(grouped);

  // Recompute decisions after the boost.
  for (const s of scored) {
    s.classified.decision = classify(s.classified).decision;
  }

  const accepted = scored.filter((s) => s.classified.decision === 'accept');
  const possible = scored.filter((s) => s.classified.decision === 'possible');
  const rejected = scored.filter((s) => s.classified.decision === 'reject');

  const deduped = dedupeNested(accepted);
  stats.acceptedCount = deduped.length;
  stats.possibleCount = possible.length;
  stats.rejectedCount = rejected.length;

  // Find the largest accepted group → that's our grid; emit a stable selector.
  const acceptedSet = new Set(deduped);
  const acceptedGrouped = groupBySignature(deduped, (s) => s.signature).filter((g) =>
    g.members.every((m) => acceptedSet.has(m) && hasFullCardSignals(m)),
  );
  const biggestGroup = acceptedGrouped[0];
  const cardSelector =
    biggestGroup && biggestGroup.members.length >= 3
      ? selectorForGroup(
          $,
          { signature: biggestGroup.signature, members: biggestGroup.members.map((m) => m.el) },
        )
      : null;

  let gridSelector: string | null = null;
  if (biggestGroup && biggestGroup.members.length >= 3) {
    const parents = biggestGroup.members.map((m) => m.el.parent());
    const firstParent = parents[0];
    if (firstParent && firstParent.length) {
      const allSameParent = parents.every((p) => p.length && p.get(0) === firstParent.get(0));
      if (allSameParent) {
        const tag = (firstParent.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? 'div';
        const cls = (firstParent.attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
        gridSelector = cls ? `${tag}.${cls.replace(/[^a-z0-9_-]/gi, '')}` : tag;
      }
    }
  }

  // Extract fields for every accepted card.
  const domCards: DetectedCard[] = deduped.map((s) => {
    const fields = extractFields($, s.el, { baseUrl: opts.pageUrl });
    const confidence = Math.min(1, s.classified.score / 100);
    return {
      ...fields,
      selector: cardSelector ?? signaturePreview(s.el),
      signature: s.signature,
      signals: s.classified.signals,
      score: s.classified.score,
      confidence,
      decision: s.classified.decision === 'accept' ? 'accept' : 'possible',
      source: 'dom',
    };
  });

  // Log a sample of rejected candidates so the operator can see why we
  // didn't keep something (helpful when running on a new shop).
  for (const r of rejected.slice(0, 5)) {
    logs.push({
      level: 'info',
      message: `rejected (score ${r.classified.score})`,
      context: { rejections: r.classified.rejections, signature: r.signature.slice(0, 80) },
    });
  }

  // ---- Step 4: merge --------------------------------------------------------
  const merged = uniqByUrl([...structuredCards, ...payloadCards, ...domCards]).filter(
    (c) => isUsable(c) || c.source === 'json-ld',
  );

  // Confidence: pick the highest of {best card, group share}. Cap at 1.
  const bestCardConfidence = merged.reduce((m, c) => Math.max(m, c.confidence), 0);
  const groupShare =
    biggestGroup && stats.candidateCount > 0
      ? Math.min(1, biggestGroup.members.length / Math.max(stats.candidateCount, 1))
      : 0;
  const confidence = Math.min(1, Math.max(bestCardConfidence, groupShare));

  logs.push({
    level: 'info',
    message: `detector summary`,
    context: {
      cards: merged.length,
      accepted: stats.acceptedCount,
      possible: stats.possibleCount,
      rejected: stats.rejectedCount,
      structuredProducts: stats.structuredProducts,
      payloadProducts: stats.payloadProducts,
      cardSelector,
      gridSelector,
      confidence: Number(confidence.toFixed(2)),
    },
  });

  return {
    cards: merged,
    gridSelector,
    cardSelector,
    confidence: Number(confidence.toFixed(2)),
    stats,
    logs,
  };
}

/** Compact, human-readable preview of an element used as a fallback selector
 *  when no stable selector could be derived for a single one-off card. */
function signaturePreview(el: Cheerio<DomNode>): string {
  const tag = (el.get(0) as { tagName?: string })?.tagName?.toLowerCase() ?? 'div';
  const cls = (el.attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
  return cls ? `${tag}.${cls}` : tag;
}
