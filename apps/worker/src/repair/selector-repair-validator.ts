import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { detectAvailability, parsePrice } from '../util/normalize.js';
import {
  PRODUCT_REPAIR_SELECTOR_FIELDS,
  REQUIRED_PRODUCT_REPAIR_FIELDS,
  type ProductRepairSelectorField,
  type ProductRepairSelectors,
  type SelectorRepairFieldResult,
  type SelectorRepairValidationResult,
} from './selector-repair-types.js';

const BAD_SELECTOR_PATTERNS = [
  /nth-child/i,
  /nth-of-type/i,
  />\s*div\s*>\s*div\s*>\s*div/i,
  /\.[a-z]?[0-9a-f]{7,}/i,
  /[a-z0-9]{8,}__[a-z0-9_-]+/i,
  /\[class\*=["'][^"']{0,3}["']\]/i,
];

const GENERIC_SELECTOR = /^(body|main|section|article|div|span|p|a|img|ul|li)$/i;
const PRODUCT_AREA_SELECTOR = [
  'main',
  '[itemtype*="Product"]',
  '[itemscope][itemtype*="schema.org/Product"]',
  '[data-product-id]',
  '[data-product]',
  '.product',
  '.product-detail',
  '.product-page',
  '.pdp',
].join(',');
const EXCLUDED_AREA_SELECTOR = [
  'header',
  'footer',
  'nav',
  'aside',
  '[role="navigation"]',
  '[aria-hidden="true"]',
  '.header',
  '.footer',
  '.nav',
  '.navbar',
  '.menu',
  '.breadcrumb-nav',
  '.mini-cart',
  '.cart',
  '.account',
  '#header',
  '#footer',
  '#nav',
].join(',');

const FIELD_MAX_COUNTS: Record<ProductRepairSelectorField, number> = {
  titleSelector: 5,
  priceSelector: 12,
  oldPriceSelector: 12,
  availabilitySelector: 20,
  imageSelector: 30,
  brandSelector: 20,
  skuSelector: 20,
  breadcrumbsSelector: 80,
};

function selectorProblem(selector: string, field: ProductRepairSelectorField): string | undefined {
  if (!selector.trim()) return 'empty selector';
  if (selector.length > 500) return 'selector too long';
  if (BAD_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector))) return 'selector looks unstable';
  if (GENERIC_SELECTOR.test(selector.trim()) && !(field === 'titleSelector' && selector.trim().toLowerCase() === 'h1')) {
    return 'selector is too generic';
  }
  return undefined;
}

function isHiddenElement(el: cheerio.Cheerio<AnyNode>) {
  let current = el;
  while (current.length) {
    const node = current.first();
    if (node.attr('hidden') != null) return true;
    if (node.attr('aria-hidden') === 'true') return true;
    const style = node.attr('style') ?? '';
    if (/display\s*:\s*none/i.test(style)) return true;
    if (/visibility\s*:\s*hidden/i.test(style)) return true;
    if (/opacity\s*:\s*0(?:[;\s]|$)/i.test(style)) return true;
    current = node.parent();
  }
  return false;
}

function isExcludedArea(el: cheerio.Cheerio<AnyNode>, field: ProductRepairSelectorField) {
  if (field === 'breadcrumbsSelector') return false;
  return el.closest(EXCLUDED_AREA_SELECTOR).length > 0;
}

function isNearProductArea(el: cheerio.Cheerio<AnyNode>) {
  return el.closest(PRODUCT_AREA_SELECTOR).length > 0 || el.parents('body').length > 0;
}

function textValue(el: cheerio.Cheerio<AnyNode>) {
  const attr = el.attr('content') ?? el.attr('value') ?? el.attr('aria-label') ?? el.attr('title');
  const text = el.text().replace(/\s+/g, ' ').trim();
  return (attr ?? text).trim();
}

function imageValue(el: cheerio.Cheerio<AnyNode>, pageUrl: string) {
  const raw =
    el.attr('src') ??
    el.attr('data-src') ??
    el.attr('data-original') ??
    el.attr('content') ??
    el.find('img').first().attr('src') ??
    el.find('img').first().attr('data-src') ??
    '';
  if (!raw.trim()) return '';
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return raw;
  }
}

function fieldValue(field: ProductRepairSelectorField, el: cheerio.Cheerio<AnyNode>, pageUrl: string) {
  if (field === 'imageSelector') return imageValue(el, pageUrl);
  return textValue(el);
}

function validateField(args: {
  $: cheerio.CheerioAPI;
  pageUrl: string;
  field: ProductRepairSelectorField;
  selector: string;
  priceRegex?: string | null;
  strict: boolean;
}): SelectorRepairFieldResult {
  const baseProblem = selectorProblem(args.selector, args.field);
  let matches: cheerio.Cheerio<AnyNode>;
  try {
    matches = args.$(args.selector);
  } catch {
    return {
      valid: false,
      selector: args.selector,
      count: 0,
      confidence: 0,
      error: 'invalid css selector',
    };
  }

  const count = matches.length;
  const el = matches.first();
  const warnings: string[] = [];
  if (baseProblem) warnings.push(baseProblem);
  if (count === 0) {
    return {
      valid: false,
      selector: args.selector,
      count,
      confidence: 0,
      error: 'selector matched nothing',
      warnings,
    };
  }
  if (count > FIELD_MAX_COUNTS[args.field]) warnings.push('selector matched too many nodes');
  if (isHiddenElement(el)) warnings.push('selector points to hidden content');
  if (isExcludedArea(el, args.field)) warnings.push('selector points to header/footer/nav/cart/account area');
  if (!isNearProductArea(el)) warnings.push('selector is outside the product page body');

  const value = fieldValue(args.field, el, args.pageUrl);
  let valid = Boolean(value);
  let error: string | undefined;

  if (!value) {
    error = 'selector produced an empty value';
  } else if (args.field === 'titleSelector' && value.length < 3) {
    valid = false;
    error = 'title is too short';
  } else if (args.field === 'priceSelector' || args.field === 'oldPriceSelector') {
    const parsed = parsePrice(value, args.priceRegex);
    if (parsed == null) {
      valid = false;
      error = 'selector did not produce a parseable price';
    }
  } else if (args.field === 'imageSelector') {
    try {
      const parsed = new URL(value, args.pageUrl);
      if (!/^https?:$/i.test(parsed.protocol)) {
        valid = false;
        error = 'image URL is not http or https';
      }
    } catch {
      valid = false;
      error = 'image selector did not produce a usable URL';
    }
  } else if (args.field === 'availabilitySelector') {
    if (!detectAvailability(value) && value.length < 3) {
      valid = false;
      error = 'availability text is not meaningful';
    }
  }

  const strictWarnings = warnings.filter((warning) => warning !== 'selector matched too many nodes');
  if (args.strict && (baseProblem || strictWarnings.length > 0)) valid = false;
  if (args.strict && count > FIELD_MAX_COUNTS[args.field]) valid = false;
  if (!error && !valid) error = warnings[0] ?? 'selector failed validation';

  const warningPenalty = warnings.length * 0.08 + Math.max(0, count - 1) * 0.01;
  const confidence = valid ? Math.max(0.25, Math.min(1, 0.95 - warningPenalty)) : 0;
  return {
    valid,
    selector: args.selector,
    value: value.slice(0, 500),
    count,
    confidence,
    error,
    warnings,
  };
}

export function mergeRepairSelectors(oldSelectors: ProductRepairSelectors, suggested: ProductRepairSelectors) {
  const merged: ProductRepairSelectors = { ...oldSelectors };
  for (const field of PRODUCT_REPAIR_SELECTOR_FIELDS) {
    const value = suggested[field];
    if (value && value.trim()) merged[field] = value.trim();
  }
  return merged;
}

export function changedRepairFields(suggested: ProductRepairSelectors): ProductRepairSelectorField[] {
  return PRODUCT_REPAIR_SELECTOR_FIELDS.filter((field) => Boolean(suggested[field]?.trim()));
}

export function validateProductSelectorRepair(args: {
  html: string;
  pageUrl: string;
  selectors: ProductRepairSelectors;
  changedFields?: ProductRepairSelectorField[];
  priceRegex?: string | null;
}): SelectorRepairValidationResult {
  const $ = cheerio.load(args.html);
  const fieldResults: Partial<Record<ProductRepairSelectorField, SelectorRepairFieldResult>> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const changed = new Set(args.changedFields ?? PRODUCT_REPAIR_SELECTOR_FIELDS);

  for (const field of PRODUCT_REPAIR_SELECTOR_FIELDS) {
    const selector = args.selectors[field];
    if (!selector) continue;
    const result = validateField({
      $,
      pageUrl: args.pageUrl,
      field,
      selector,
      priceRegex: args.priceRegex,
      strict: changed.has(field) || REQUIRED_PRODUCT_REPAIR_FIELDS.includes(field as (typeof REQUIRED_PRODUCT_REPAIR_FIELDS)[number]),
    });
    fieldResults[field] = result;
    for (const warning of result.warnings ?? []) {
      warnings.push(`${field}: ${warning}`);
    }
    if (!result.valid && (changed.has(field) || REQUIRED_PRODUCT_REPAIR_FIELDS.includes(field as (typeof REQUIRED_PRODUCT_REPAIR_FIELDS)[number]))) {
      errors.push(`${field}: ${result.error ?? 'invalid selector'}`);
    }
  }

  for (const field of REQUIRED_PRODUCT_REPAIR_FIELDS) {
    if (!fieldResults[field]?.valid) errors.push(`${field}: required field was not repaired`);
  }

  const scoringFields = new Set<ProductRepairSelectorField>([
    ...REQUIRED_PRODUCT_REPAIR_FIELDS,
    ...Array.from(changed),
  ]);
  const scoredFields = PRODUCT_REPAIR_SELECTOR_FIELDS
    .filter((field) => scoringFields.has(field))
    .map((field) => fieldResults[field])
    .filter((result): result is SelectorRepairFieldResult => Boolean(result));
  const avgConfidence =
    scoredFields.length > 0
      ? scoredFields.reduce((sum, result) => sum + result.confidence, 0) / scoredFields.length
      : 0;
  const requiredConfidence =
    REQUIRED_PRODUCT_REPAIR_FIELDS.reduce((sum, field) => sum + (fieldResults[field]?.confidence ?? 0), 0) /
    REQUIRED_PRODUCT_REPAIR_FIELDS.length;
  const overallConfidence = Math.max(
    0,
    Math.min(1, Math.min(avgConfidence || requiredConfidence, requiredConfidence) - errors.length * 0.12),
  );

  return {
    valid: errors.length === 0 && overallConfidence >= 0.45,
    fieldResults,
    overallConfidence,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
