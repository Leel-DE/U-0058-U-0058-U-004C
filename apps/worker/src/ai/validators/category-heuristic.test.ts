import { describe, expect, it } from 'vitest';
import { detectCategoryHeuristics } from './category-heuristic.js';

describe('detectCategoryHeuristics', () => {
  it('finds repeated product cards', () => {
    const html = `
      <article class="product-card"><h2>One</h2><span class="price">EUR 1</span><a href="/1">One</a><img src="/1.jpg" /></article>
      <article class="product-card"><h2>Two</h2><span class="price">EUR 2</span><a href="/2">Two</a><img src="/2.jpg" /></article>
      <article class="product-card"><h2>Three</h2><span class="price">EUR 3</span><a href="/3">Three</a><img src="/3.jpg" /></article>
    `;

    expect(detectCategoryHeuristics(html)?.productCardSelector).toBe('[class*="product-card" i]');
  });
});

