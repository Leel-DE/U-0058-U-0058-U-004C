import { describe, expect, it } from 'vitest';
import { DiscoveryDeduper } from './discovery-deduper.js';
import type { DiscoveryProduct } from './types.js';

function product(patch: Partial<DiscoveryProduct>): DiscoveryProduct {
  return {
    id: crypto.randomUUID(),
    url: 'https://x.test/p',
    normalizedUrl: 'https://x.test/p',
    sourcePageUrl: 'https://x.test/c',
    breadcrumbs: [],
    confidence: 0.5,
    source: 'category_card',
    errors: [],
    ...patch,
  };
}

describe('DiscoveryDeduper', () => {
  it('merges by url and sku', () => {
    const d = new DiscoveryDeduper();
    d.upsert(product({ title: 'Bike', sku: 'SKU1' }));
    d.upsert(product({ normalizedUrl: 'https://x.test/other', url: 'https://x.test/other', price: 10, sku: 'SKU1' }));
    expect(d.values()).toHaveLength(1);
    expect(d.values()[0]?.price).toBe(10);
  });
});

