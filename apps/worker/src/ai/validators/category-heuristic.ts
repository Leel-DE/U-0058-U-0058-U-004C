import * as cheerio from 'cheerio';
import type { CategorySuggestion } from '../schemas/category-suggestion.js';
import { validateCategorySelectors } from './selector-validator.js';

const CARD_CANDIDATES = [
  '[itemtype*="Product"]',
  '[data-testid*="product" i]',
  '[data-test*="product" i]',
  '[class*="product-card" i]',
  '[class*="product-tile" i]',
  '[class*="product-item" i]',
  'article',
];

export function detectCategoryHeuristics(html: string): CategorySuggestion | null {
  const $ = cheerio.load(html);
  for (const cardSelector of CARD_CANDIDATES) {
    const count = $(cardSelector).length;
    if (count < 2) continue;
    const suggestion: CategorySuggestion = {
      productCardSelector: cardSelector,
      cardTitleSelector: `${cardSelector} [itemprop="name"], ${cardSelector} h2, ${cardSelector} h3, ${cardSelector} [class*="title" i]`,
      cardPriceSelector: `${cardSelector} [itemprop="price"], ${cardSelector} [class*="price" i], ${cardSelector} [data-testid*="price" i]`,
      cardLinkSelector: `${cardSelector} a[href]`,
      cardImageSelector: `${cardSelector} img`,
      confidence: Math.min(0.8, 0.45 + count * 0.03),
    };
    if (validateCategorySelectors(html, suggestion).ok) return suggestion;
  }
  return null;
}

