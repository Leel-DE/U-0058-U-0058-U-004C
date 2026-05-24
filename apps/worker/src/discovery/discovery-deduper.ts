import type { DiscoveryProduct } from './types.js';

function mergeProduct(base: DiscoveryProduct, next: DiscoveryProduct): DiscoveryProduct {
  return {
    ...base,
    title: base.title ?? next.title,
    price: base.price ?? next.price,
    oldPrice: base.oldPrice ?? next.oldPrice,
    currency: base.currency ?? next.currency,
    availability: base.availability ?? next.availability,
    imageUrl: base.imageUrl ?? next.imageUrl,
    brand: base.brand ?? next.brand,
    sku: base.sku ?? next.sku,
    ean: base.ean ?? next.ean,
    gtin: base.gtin ?? next.gtin,
    rating: base.rating ?? next.rating,
    shipping: base.shipping ?? next.shipping,
    breadcrumbs: [...new Set([...base.breadcrumbs, ...next.breadcrumbs])],
    categoryPath: [...new Set([base.categoryPath, next.categoryPath].filter(Boolean))].join(' | ') || undefined,
    rawCardJson: base.rawCardJson ?? next.rawCardJson,
    rawDetailJson: base.rawDetailJson ?? next.rawDetailJson,
    confidence: Math.max(base.confidence, next.confidence),
    source: base.source === 'product_detail' || next.source === 'product_detail' ? 'product_detail' : base.source,
    errors: [...new Set([...base.errors, ...next.errors])],
  };
}

export class DiscoveryDeduper {
  private readonly byUrl = new Map<string, DiscoveryProduct>();
  private readonly keyToUrl = new Map<string, string>();

  upsert(product: DiscoveryProduct): DiscoveryProduct {
    const keys = [product.normalizedUrl, product.sku && `sku:${product.sku}`, product.gtin && `gtin:${product.gtin}`, product.ean && `ean:${product.ean}`].filter(Boolean) as string[];
    const existingUrl = keys.map((key) => this.keyToUrl.get(key)).find(Boolean);
    if (existingUrl) {
      const existing = this.byUrl.get(existingUrl);
      if (existing) {
        const merged = mergeProduct(existing, product);
        this.byUrl.set(existingUrl, merged);
        for (const key of keys) this.keyToUrl.set(key, existingUrl);
        return merged;
      }
    }
    this.byUrl.set(product.normalizedUrl, product);
    for (const key of keys) this.keyToUrl.set(key, product.normalizedUrl);
    return product;
  }

  values() {
    return [...this.byUrl.values()];
  }
}

