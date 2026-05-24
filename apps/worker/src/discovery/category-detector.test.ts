import { describe, expect, it } from 'vitest';
import { detectCategory } from './category-detector.js';

describe('detectCategory', () => {
  it('uses h1 and breadcrumbs', () => {
    const category = detectCategory('https://x.test/e-bikes', '<nav class="breadcrumb"><a>Bikes</a></nav><h1>E-Bikes</h1>', 12, 2);
    expect(category.name).toBe('E-Bikes');
    expect(category.productsFound).toBe(12);
  });
});

