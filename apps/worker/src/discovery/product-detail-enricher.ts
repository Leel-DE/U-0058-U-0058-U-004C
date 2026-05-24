import * as cheerio from 'cheerio';
import type { DiscoveryProduct } from './types.js';
import { extract } from '../parser/cascade.js';
import { extractBreadcrumbs } from './category-detector.js';

function firstMeta($: cheerio.CheerioAPI, names: string[]) {
  for (const name of names) {
    const value = $(`meta[property="${name}"], meta[name="${name}"], [itemprop="${name}"]`).attr('content') ?? $(`[itemprop="${name}"]`).first().text();
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function enrichProductFromDetail(product: DiscoveryProduct, html: string): DiscoveryProduct {
  const $ = cheerio.load(html);
  const extracted = extract(html, { useJsonLd: true, useOpenGraph: true });
  const breadcrumbs = extractBreadcrumbs($);
  const detail = {
    sku: firstMeta($, ['sku', 'product:retailer_item_id']),
    gtin: firstMeta($, ['gtin', 'gtin13', 'gtin14', 'ean']),
    brand: firstMeta($, ['brand', 'product:brand']),
    description: firstMeta($, ['description', 'og:description']),
  };
  return {
    ...product,
    title: extracted?.title ?? product.title,
    price: extracted?.price ?? product.price,
    oldPrice: extracted?.oldPrice ?? product.oldPrice,
    currency: extracted?.currency ?? product.currency,
    availability: extracted?.availability ?? product.availability,
    imageUrl: extracted?.image ?? product.imageUrl,
    shipping: extracted?.shipping ?? product.shipping,
    rating: extracted?.rating ?? product.rating,
    sku: detail.sku ?? product.sku,
    ean: detail.gtin ?? product.ean,
    gtin: detail.gtin ?? product.gtin,
    brand: detail.brand ?? product.brand,
    breadcrumbs: breadcrumbs.length ? breadcrumbs : product.breadcrumbs,
    rawDetailJson: detail,
    confidence: Math.min(1, product.confidence + 0.1),
    source: 'product_detail',
    errors: extracted?.title && extracted.price != null ? product.errors.filter((err) => err !== 'incomplete_card') : product.errors,
  };
}

