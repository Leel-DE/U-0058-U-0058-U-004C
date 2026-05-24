import * as cheerio from 'cheerio';
import { parsePrice } from '../../util/normalize.js';
import type { SelectorSuggestion } from '../schemas/selector-suggestion.js';
import type { CategorySuggestion } from '../schemas/category-suggestion.js';

export interface SelectorFieldValidation {
  selector: string;
  count: number;
  sample?: string;
  valid: boolean;
  reason?: string;
}

export interface SelectorValidationResult {
  ok: boolean;
  confidence: number;
  fields: Record<string, SelectorFieldValidation>;
  extracted: {
    title?: string;
    price?: number;
    image?: string;
  };
}

const BAD_SELECTOR_PATTERNS = [
  /nth-child/i,
  /nth-of-type/i,
  /[a-z0-9]{8,}__[a-z0-9_-]+/i,
  /\.[a-z]?[0-9a-f]{7,}/i,
  />\s*div\s*>\s*div\s*>\s*div/i,
];

function validateCssSelector(selector: string): string | undefined {
  if (!selector.trim()) return 'empty selector';
  if (selector.length > 500) return 'selector too long';
  if (BAD_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector))) return 'selector looks unstable';
  return undefined;
}

function textSample($: cheerio.CheerioAPI, selector: string): string | undefined {
  const el = $(selector).first();
  const attr = el.attr('src') ?? el.attr('href');
  const text = el.text().replace(/\s+/g, ' ').trim();
  return (text || attr || undefined)?.slice(0, 300);
}

export function validateProductSelectors(html: string, suggestion: SelectorSuggestion): SelectorValidationResult {
  const $ = cheerio.load(html);
  const fields: Record<string, SelectorFieldValidation> = {};
  const selectors = {
    titleSelector: suggestion.titleSelector,
    priceSelector: suggestion.priceSelector,
    oldPriceSelector: suggestion.oldPriceSelector,
    availabilitySelector: suggestion.availabilitySelector,
    imageSelector: suggestion.imageSelector,
    shippingSelector: suggestion.shippingSelector,
    ratingSelector: suggestion.ratingSelector,
  };

  for (const [key, selector] of Object.entries(selectors)) {
    if (!selector) continue;
    const reason = validateCssSelector(selector);
    let count = 0;
    let sample: string | undefined;
    try {
      count = $(selector).length;
      sample = textSample($, selector);
    } catch {
      fields[key] = { selector, count: 0, valid: false, reason: 'invalid css selector' };
      continue;
    }
    fields[key] = {
      selector,
      count,
      sample,
      valid: !reason && count > 0,
      reason: reason ?? (count === 0 ? 'selector matched nothing' : undefined),
    };
  }

  const title = suggestion.titleSelector ? textSample($, suggestion.titleSelector) : undefined;
  const priceText = suggestion.priceSelector ? textSample($, suggestion.priceSelector) : undefined;
  const price = parsePrice(priceText);
  const image = suggestion.imageSelector
    ? ($(suggestion.imageSelector).first().attr('src') ?? $(suggestion.imageSelector).first().attr('data-src'))
    : undefined;
  if (suggestion.priceSelector && price == null) {
    fields.priceSelector = {
      ...(fields.priceSelector ?? { selector: suggestion.priceSelector, count: 0, valid: false }),
      valid: false,
      reason: 'price selector did not produce a parseable price',
    };
  }
  if (suggestion.imageSelector && image && !/^https?:\/\//i.test(image) && !image.startsWith('/')) {
    fields.imageSelector = {
      ...(fields.imageSelector ?? { selector: suggestion.imageSelector, count: 0, valid: false }),
      valid: false,
      reason: 'image selector did not produce a usable URL',
    };
  }

  const requiredOk = Boolean(title) && price != null;
  const invalidCount = Object.values(fields).filter((field) => !field.valid).length;
  const confidence = Math.max(0, Math.min(1, suggestion.confidence - invalidCount * 0.12 + (requiredOk ? 0.05 : -0.25)));
  return { ok: requiredOk && invalidCount === 0 && confidence >= 0.55, confidence, fields, extracted: { title, price, image } };
}

export function validateCategorySelectors(html: string, suggestion: CategorySuggestion): SelectorValidationResult {
  const $ = cheerio.load(html);
  const fields: Record<string, SelectorFieldValidation> = {};
  for (const [key, selector] of Object.entries(suggestion)) {
    if (key === 'confidence' || !selector || typeof selector !== 'string') continue;
    const reason = validateCssSelector(selector);
    let count = 0;
    let sample: string | undefined;
    try {
      count = $(selector).length;
      sample = textSample($, selector);
    } catch {
      fields[key] = { selector, count: 0, valid: false, reason: 'invalid css selector' };
      continue;
    }
    fields[key] = { selector, count, sample, valid: !reason && count > 0, reason: reason ?? (count === 0 ? 'selector matched nothing' : undefined) };
  }
  const cardCount = suggestion.productCardSelector ? $(suggestion.productCardSelector).length : 0;
  const ok = cardCount >= 2 && Object.values(fields).every((field) => field.valid);
  return { ok, confidence: ok ? suggestion.confidence : Math.min(suggestion.confidence, 0.5), fields, extracted: {} };
}

