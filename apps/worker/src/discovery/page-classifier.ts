import * as cheerio from 'cheerio';
import type { DiscoveryPageType } from './types.js';
import { isLikelyCategoryUrl, isLikelyProductUrl } from './url-normalizer.js';

export interface PageClassification {
  pageType: DiscoveryPageType;
  confidence: number;
  signals: string[];
}

/**
 * EXPLICIT captcha-challenge markers — must match real challenge UI, NOT
 * the word "captcha" appearing in GDPR footer text (e.g. "Diese Seite
 * ist durch reCAPTCHA geschützt"). Kept in sync with classifyResponseStrict
 * in apps/worker/src/detect/block.ts.
 */
const EXPLICIT_CAPTCHA_MARKERS: RegExp[] = [
  /<div[^>]+class=["'][^"']*g-recaptcha/i,
  /<iframe[^>]+src=["'][^"']*google\.com\/recaptcha/i,
  /<iframe[^>]+src=["'][^"']*recaptcha\.net\/recaptcha/i,
  /<iframe[^>]+src=["'][^"']*hcaptcha\.com/i,
  /<div[^>]+class=["'][^"']*h-captcha/i,
  /<div[^>]+id=["']cf-(challenge|error-details|wrapper)/i,
  /<form[^>]+action=["'][^"']*\/cdn-cgi\/challenge/i,
  /window\._cf_chl_opt\s*=/i,
  /<title>just a moment\.\.\.<\/title>/i,
  /<title>attention required![^<]*<\/title>/i,
];

export function classifyDiscoveryPage(url: string, html: string): PageClassification {
  const $ = cheerio.load(html);
  const signals: string[] = [];
  const textHead = html.slice(0, 16_000);
  if (EXPLICIT_CAPTCHA_MARKERS.some((re) => re.test(textHead))) {
    return { pageType: 'captcha', confidence: 0.9, signals: ['captcha_widget'] };
  }

  let productScore = 0;
  let categoryScore = 0;
  const productSchema = $('script[type="application/ld+json"]').text();
  if (/"@type"\s*:\s*"Product"/i.test(productSchema)) {
    productScore += 0.45;
    signals.push('schema_product');
  }
  if (/"@type"\s*:\s*"ItemList"/i.test(productSchema)) {
    categoryScore += 0.35;
    signals.push('schema_item_list');
  }
  if ($('[itemtype*="Product"], [itemprop="offers"], [itemprop="price"]').length) {
    productScore += 0.25;
    signals.push('product_microdata');
  }
  const productCardSelector =
    '[data-product-id], [data-variant-id], [data-sku], [data-article-id], ' +
    '[itemtype*="Product"], [data-testid*="product" i], ' +
    '[class*="product-card" i], [class*="product-tile" i], [class*="product-item" i], ' +
    '[class*="artikel" i], [class*="produkt" i], article';
  const productCards = $(productCardSelector).length;
  if (productCards >= 3) {
    categoryScore += Math.min(0.45, productCards * 0.04);
    signals.push(`repeated_product_cards(${productCards})`);
  }
  if ($('[class*="pagination" i], nav[aria-label*="pagination" i], a[rel="next"], [class*="filter" i], [class*="sort" i]').length) {
    categoryScore += 0.2;
    signals.push('listing_controls');
  }
  if (isLikelyProductUrl(url)) {
    productScore += 0.2;
    signals.push('product_url');
  }
  if (isLikelyCategoryUrl(url)) {
    categoryScore += 0.25;
    signals.push('category_url');
  }
  if (new URL(url).pathname === '/' || new URL(url).pathname === '') {
    return { pageType: 'homepage', confidence: 0.9, signals: ['root_path'] };
  }
  if (productScore >= categoryScore && productScore >= 0.45) {
    return { pageType: 'product', confidence: Math.min(1, productScore), signals };
  }
  if (categoryScore >= 0.45) {
    return { pageType: 'category', confidence: Math.min(1, categoryScore), signals };
  }
  return { pageType: 'content', confidence: Math.max(0.25, Math.max(productScore, categoryScore)), signals };
}

export function pageTitleAndH1(html: string) {
  const $ = cheerio.load(html);
  return {
    title: $('title').first().text().replace(/\s+/g, ' ').trim() || undefined,
    h1: $('h1').first().text().replace(/\s+/g, ' ').trim() || undefined,
    canonicalUrl: $('link[rel="canonical"]').attr('href') || undefined,
  };
}

