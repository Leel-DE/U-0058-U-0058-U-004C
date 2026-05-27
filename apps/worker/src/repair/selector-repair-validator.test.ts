import { describe, expect, it } from 'vitest';
import { validateProductSelectorRepair } from './selector-repair-validator.js';

const html = `
  <header><span class="price">EUR 1.00</span></header>
  <main class="product-page">
    <h1 data-testid="product-title">Acme Headphones</h1>
    <span data-testid="product-price">EUR 189.90</span>
    <span class="stock">In stock</span>
    <img class="hero-image" src="/img.jpg" />
  </main>
`;

describe('selector repair validator', () => {
  it('validates stable product selectors locally', () => {
    const result = validateProductSelectorRepair({
      html,
      pageUrl: 'https://shop.test/products/acme',
      selectors: {
        titleSelector: '[data-testid="product-title"]',
        priceSelector: '[data-testid="product-price"]',
        availabilitySelector: '.stock',
        imageSelector: '.hero-image',
      },
      changedFields: ['titleSelector', 'priceSelector', 'availabilitySelector', 'imageSelector'],
    });

    expect(result.valid).toBe(true);
    expect(result.fieldResults.priceSelector?.value).toBe('EUR 189.90');
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0.75);
  });

  it('rejects header prices and generic selectors', () => {
    const result = validateProductSelectorRepair({
      html,
      pageUrl: 'https://shop.test/products/acme',
      selectors: {
        titleSelector: 'h1',
        priceSelector: 'header .price',
      },
      changedFields: ['titleSelector', 'priceSelector'],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('priceSelector'))).toBe(true);
  });

  it('rejects non-parseable repaired prices', () => {
    const result = validateProductSelectorRepair({
      html: '<main class="product-page"><h1>Bike</h1><span class="price">contact us</span></main>',
      pageUrl: 'https://shop.test/products/bike',
      selectors: {
        titleSelector: 'h1',
        priceSelector: '.price',
      },
      changedFields: ['priceSelector'],
    });

    expect(result.valid).toBe(false);
    expect(result.fieldResults.priceSelector?.error).toContain('parseable price');
  });
});
