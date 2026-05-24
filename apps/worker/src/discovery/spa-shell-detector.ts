/**
 * Detect "SPA shell" pages — pages whose static HTML contains a known
 * product-list container that is **empty** because the cards are populated
 * by client-side JS after the page loads. These pages need a browser-based
 * fetch (Playwright) to be useful for discovery.
 *
 * Triggered for:
 *   - Tilda (T-Store)   — `.t-store__card-list` / `.js-store-prod-list`
 *   - Shopify           — `[data-section-type="product-grid"]` with no children
 *   - InSales           — `.js-products-list` / `.js-catalog-products`
 *   - 1C-Bitrix (CIS)   — `#catalog_section_wrapper` placeholders
 *   - Wix Stores        — `[data-hook="product-list"]`
 *   - Generic SPA       — body has near-zero content size AND a known JS framework root
 *
 * Returns:
 *   - `{ likely: true,  reason }` → caller should retry with Playwright.
 *   - `{ likely: false }`         → static HTML already has the cards (or
 *                                   this isn't a product listing at all).
 */
import * as cheerio from 'cheerio';

export interface SpaShellResult {
  likely: boolean;
  reason?: string;
  emptyContainerSelector?: string;
}

/** Containers that store-builders use for the product list. Key = selector,
 *  value = friendly name used in logs. */
const KNOWN_LIST_CONTAINERS: ReadonlyArray<{ selector: string; name: string }> = [
  { selector: '.t-store__card-list, .js-store-prod-list, .t-store__grid-cont', name: 'tilda' },
  { selector: '.js-products-list, .js-catalog-products, .products-list--catalog', name: 'insales' },
  { selector: '[data-section-type="product-grid"], [data-section-type="collection"]', name: 'shopify' },
  { selector: '#catalog_section_wrapper, .catalog_section_wrapper, .js-catalog-section', name: 'bitrix' },
  { selector: '[data-hook="product-list"], [data-hook="product-grid"]', name: 'wix' },
  { selector: '.js-product-list, .js-product-grid', name: 'generic-js' },
];

/** Markers in script/meta tags that confirm a JS framework is responsible
 *  for rendering. Combined with an empty list container = high confidence. */
const FRAMEWORK_MARKERS: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /tildacdn\.(?:com|net|one)/i, name: 'tilda-cdn' },
  { pattern: /window\.tildaInit/i, name: 'tilda-init' },
  { pattern: /cdn\.shopify\.com/i, name: 'shopify-cdn' },
  { pattern: /Shopify\.theme/i, name: 'shopify-theme' },
  { pattern: /insales-cdn\.com/i, name: 'insales' },
  { pattern: /bitrix\.(?:js|info)/i, name: 'bitrix' },
  { pattern: /static\.wixstatic\.com/i, name: 'wix' },
  { pattern: /<script\s+id=["']__NEXT_DATA__["']/i, name: 'next.js' },
  { pattern: /window\.__NUXT__/i, name: 'nuxt' },
];

/** How many direct children counts as "populated enough that JS already ran". */
const POPULATED_THRESHOLD = 2;

export function detectSpaShell(html: string): SpaShellResult {
  if (!html || html.length < 50) {
    return { likely: false };
  }

  const $ = cheerio.load(html);

  // 1. Does the page have any of the well-known store-builder containers
  //    AND is it empty (or has only a single skeleton/placeholder child)?
  for (const { selector, name } of KNOWN_LIST_CONTAINERS) {
    const containers = $(selector);
    if (containers.length === 0) continue;
    // If even one of them is sparse, treat the whole page as SPA shell.
    let sparseHit: string | null = null;
    containers.each((_, el) => {
      const children = $(el).children().length;
      if (children <= POPULATED_THRESHOLD) sparseHit = selector;
    });
    if (sparseHit) {
      return {
        likely: true,
        reason: `${name}_empty_list`,
        emptyContainerSelector: sparseHit,
      };
    }
  }

  // 2. The page has a framework marker AND very little visible body text.
  //    Body of an SSR'd category usually has the product titles inline —
  //    a body with <1 KB of visible text on a 100 KB+ HTML doc is a SPA.
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  if (bodyText.length < 500 && html.length > 50_000) {
    const fwHit = FRAMEWORK_MARKERS.find((m) => m.pattern.test(html.slice(0, 80_000)));
    if (fwHit) {
      return { likely: true, reason: `${fwHit.name}_sparse_body` };
    }
  }

  return { likely: false };
}
