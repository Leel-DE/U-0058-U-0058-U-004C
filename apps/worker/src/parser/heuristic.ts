import type { CheerioAPI } from 'cheerio';
import type { Extracted } from '../types.js';
import { detectAvailability, detectCurrency, parsePrice } from '../util/normalize.js';

const TITLE_SELECTORS = [
  '[itemprop="name"]',
  '[data-testid*="title" i]',
  '[data-test*="title" i]',
  'h1',
  '.product-title',
  '.product__title',
];

const PRICE_SELECTORS = [
  '[itemprop="price"]',
  '[data-testid*="price" i]',
  '[data-test*="price" i]',
  '[class*="price" i]',
  '[aria-label*="price" i]',
];

const AVAILABILITY_SELECTORS = [
  '[itemprop="availability"]',
  '[data-testid*="stock" i]',
  '[data-test*="stock" i]',
  '[class*="stock" i]',
  '[class*="availability" i]',
];

const IMAGE_SELECTORS = [
  '[itemprop="image"]',
  '[data-testid*="image" i] img',
  '.product-gallery img',
  '.product img',
  'main img',
];

function firstText($: CheerioAPI, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const el = $(selector).first();
    const text = (el.attr('content') ?? el.attr('aria-label') ?? el.text()).replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return undefined;
}

function firstAttr($: CheerioAPI, selectors: string[], attrs: string[]): string | undefined {
  for (const selector of selectors) {
    const el = $(selector).first();
    for (const attr of attrs) {
      const value = el.attr(attr);
      if (value) return value;
    }
  }
  return undefined;
}

export function parseHeuristics($: CheerioAPI): Extracted | null {
  const title = firstText($, TITLE_SELECTORS);
  const priceText = firstText($, PRICE_SELECTORS);
  const availabilityText = firstText($, AVAILABILITY_SELECTORS);
  const image = firstAttr($, IMAGE_SELECTORS, ['src', 'data-src', 'content']);
  const price = parsePrice(priceText);
  if (!title && price == null) return null;
  return {
    title,
    price,
    currency: detectCurrency(priceText),
    availability: detectAvailability(availabilityText),
    image,
  };
}

