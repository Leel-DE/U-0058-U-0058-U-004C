import { describe, expect, it } from 'vitest';
import { validateCategorySelectors, validateProductSelectors } from './selector-validator.js';

const productHtml = `
  <main>
    <h1 itemprop="name">Acme Headphones</h1>
    <span data-testid="price">EUR 189.90</span>
    <img itemprop="image" src="/img.jpg" />
  </main>
`;

describe('selector validator', () => {
  it('accepts stable product selectors with parseable price', () => {
    const result = validateProductSelectors(productHtml, {
      titleSelector: '[itemprop="name"]',
      priceSelector: '[data-testid="price"]',
      imageSelector: '[itemprop="image"]',
      confidence: 0.9,
      notes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.extracted.price).toBe(189.9);
  });

  it('rejects hallucinated selectors', () => {
    const result = validateProductSelectors(productHtml, {
      titleSelector: '.missing-title',
      priceSelector: '.missing-price',
      confidence: 0.9,
      notes: [],
    });

    expect(result.ok).toBe(false);
    expect(result.fields.titleSelector?.valid).toBe(false);
  });

  it('validates repeated category card selectors', () => {
    const html = `
      <article class="product-card"><h2>One</h2><span class="price">EUR 1</span><a href="/1">One</a><img src="/1.jpg" /></article>
      <article class="product-card"><h2>Two</h2><span class="price">EUR 2</span><a href="/2">Two</a><img src="/2.jpg" /></article>
    `;
    const result = validateCategorySelectors(html, {
      productCardSelector: '.product-card',
      cardTitleSelector: '.product-card h2',
      cardPriceSelector: '.product-card .price',
      cardLinkSelector: '.product-card a',
      cardImageSelector: '.product-card img',
      confidence: 0.8,
    });

    expect(result.ok).toBe(true);
  });
});
