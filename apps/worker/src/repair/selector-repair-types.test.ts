import { describe, expect, it } from 'vitest';
import { selectorRepairSuggestionSchema } from './selector-repair-types.js';

describe('selector repair schemas', () => {
  it('accepts the Gemini JSON-only repair response shape', () => {
    const parsed = selectorRepairSuggestionSchema.parse({
      selectors: {
        titleSelector: '[itemprop="name"]',
        priceSelector: '[data-testid="price"]',
        oldPriceSelector: null,
        availabilitySelector: '.stock',
        imageSelector: '[itemprop="image"]',
      },
      confidence: 0.88,
      reason: 'Product detail selectors moved to semantic attributes.',
      warnings: [],
    });

    expect(parsed.confidence).toBe(0.88);
    expect(parsed.selectors.priceSelector).toBe('[data-testid="price"]');
  });

  it('rejects non-json-compatible confidence values', () => {
    expect(() =>
      selectorRepairSuggestionSchema.parse({
        selectors: { priceSelector: '.price' },
        confidence: 1.4,
        reason: 'bad',
        warnings: [],
      }),
    ).toThrow();
  });
});
