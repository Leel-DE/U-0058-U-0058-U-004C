import { describe, expect, it } from 'vitest';
import { detectFramework } from './framework-detector.js';

describe('detectFramework', () => {
  it('detects Shopify signatures', () => {
    const result = detectFramework(`
      <script>window.Shopify = {}; ShopifyAnalytics = { meta: {} };</script>
      <script src="https://cdn.shopify.com/theme.js"></script>
    `);
    expect(result.framework).toBe('shopify');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('detects Shopware signatures', () => {
    const result = detectFramework(`
      <div data-product-information='{"name":"Bike"}'></div>
      <script src="/bundles/storefront/shopware.js"></script>
    `);
    expect(result.framework).toBe('shopware');
  });

  it('falls back to custom when no known signature exists', () => {
    const result = detectFramework('<main><h1>Local shop</h1></main>');
    expect(result.framework).toBe('custom');
  });
});
