import * as cheerio from 'cheerio';
import type { Extracted, ExtractedWithSource, ScrapingRules, SourcePath } from '../types';
import { parseJsonLd } from './json-ld';
import { parseOpenGraph } from './open-graph';
import { parseSelectors } from './selector';

function merge(base: Extracted, other: Extracted): Extracted {
  return {
    title: base.title ?? other.title,
    price: base.price ?? other.price,
    oldPrice: base.oldPrice ?? other.oldPrice,
    currency: base.currency ?? other.currency,
    availability: base.availability ?? other.availability,
    image: base.image ?? other.image,
    shipping: base.shipping ?? other.shipping,
    rating: base.rating ?? other.rating,
  };
}

function scoreConfidence(e: Extracted, primary: SourcePath): number {
  let score = 0;
  if (e.title) score += 0.3;
  if (e.price != null && e.price > 0) score += 0.4;
  if (e.currency) score += 0.1;
  if (e.availability) score += 0.1;
  if (e.image) score += 0.05;
  if (primary === 'json-ld') score = Math.min(1, score + 0.05);
  return Math.min(1, score);
}

export function extract(html: string, rules: ScrapingRules): ExtractedWithSource | null {
  const $ = cheerio.load(html);

  let combined: Extracted = {};
  let primary: SourcePath | null = null;
  const tried: SourcePath[] = [];

  if (rules.useJsonLd) {
    const r = parseJsonLd($);
    if (r) {
      combined = merge(combined, r);
      primary = primary ?? 'json-ld';
      tried.push('json-ld');
    }
  }
  if (rules.useOpenGraph) {
    const r = parseOpenGraph($);
    if (r) {
      combined = merge(combined, r);
      primary = primary ?? 'og';
      tried.push('og');
    }
  }
  const sel = parseSelectors($, rules);
  if (sel) {
    combined = merge(combined, sel);
    primary = primary ?? 'selector';
    tried.push('selector');
  }

  if (!primary || combined.price == null) return null;

  const sourcePath: SourcePath = tried.length > 1 ? 'mixed' : primary;
  return {
    ...combined,
    sourcePath,
    confidence: scoreConfidence(combined, primary),
  };
}
