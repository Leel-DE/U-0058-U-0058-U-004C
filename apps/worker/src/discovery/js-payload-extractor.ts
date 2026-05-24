/**
 * Best-effort extraction of product lists from framework-specific JSON
 * payloads embedded in the page. Read-only: we parse the same DOM the
 * browser ships; we never call private APIs or use auth.
 *
 * Supported sources (each guarded; first hit wins):
 *   - Next.js     <script id="__NEXT_DATA__" type="application/json">
 *   - Nuxt        window.__NUXT__ = {...}
 *   - Shopify     window.ShopifyAnalytics.meta / .meta.products
 *                 [data-product-json] / [type="application/json"][data-product-json]
 *   - WooCommerce window.wcSettings / [data-product_variations]
 *   - Magento     <script type="text/x-magento-init">...{"data":{...}}</script>
 *   - dataLayer.ecommerce.* (GA4 / GTM)
 *   - Shopware    data-product-information
 */
import * as cheerio from 'cheerio';

export interface PayloadProduct {
  title?: string;
  price?: number;
  currency?: string;
  productUrl?: string;
  imageUrl?: string;
  sku?: string;
  ean?: string;
  gtin?: string;
  brand?: string;
  source: PayloadSource;
}

export type PayloadSource =
  | 'next_data'
  | 'nuxt'
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'datalayer'
  | 'shopware'
  | 'data-attr';

export interface PayloadResult {
  source: PayloadSource;
  products: PayloadProduct[];
  raw?: unknown;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Walk an arbitrary JSON tree looking for objects that look like products
 *  (have a price + title/name + optional url). Bounded to avoid stack blow-up
 *  on deeply nested payloads. */
function walkForProducts(root: unknown, source: PayloadSource, out: PayloadProduct[], depth = 0): void {
  if (depth > 8 || out.length >= 500) return;
  if (Array.isArray(root)) {
    for (const v of root) walkForProducts(v, source, out, depth + 1);
    return;
  }
  if (!root || typeof root !== 'object') return;
  const obj = root as Record<string, unknown>;

  // Heuristic: any object with (price OR offers) AND (title OR name) is a product.
  const title = (typeof obj.title === 'string' && obj.title) || (typeof obj.name === 'string' && obj.name) || undefined;
  const priceRaw = obj.price ?? (obj as { offers?: { price?: unknown } }).offers?.price ?? obj.priceValue ?? obj.cost;
  const price = toNumber(priceRaw);
  const urlRaw = obj.url ?? obj.link ?? obj.handle ?? obj.permalink;
  const imageRaw =
    obj.image ??
    obj.imageUrl ??
    obj.thumbnail ??
    (Array.isArray(obj.images) ? (obj.images[0] as { src?: string } | string | undefined) : undefined);

  if (title && price != null) {
    out.push({
      title: String(title),
      price,
      currency: typeof obj.currency === 'string' ? obj.currency : typeof obj.priceCurrency === 'string' ? obj.priceCurrency : undefined,
      productUrl: typeof urlRaw === 'string' ? urlRaw : undefined,
      imageUrl: typeof imageRaw === 'string' ? imageRaw : (imageRaw as { src?: string } | undefined)?.src,
      sku: typeof obj.sku === 'string' ? obj.sku : typeof obj.id === 'string' ? obj.id : undefined,
      ean: typeof obj.ean === 'string' ? obj.ean : undefined,
      gtin:
        typeof obj.gtin === 'string'
          ? obj.gtin
          : typeof obj.gtin13 === 'string'
            ? obj.gtin13
            : typeof obj.gtin12 === 'string'
              ? obj.gtin12
              : typeof obj.gtin8 === 'string'
                ? obj.gtin8
                : undefined,
      brand: typeof obj.brand === 'string' ? obj.brand : (obj.brand as { name?: string } | undefined)?.name,
      source,
    });
    // Continue walking — nested variants may also be products.
  }

  for (const key of Object.keys(obj)) walkForProducts(obj[key], source, out, depth + 1);
}

function tryParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Window-bound JS assignments: `window.X = { ... };`. Extracted via regex
 *  rather than eval to stay safe. We tolerate trailing semicolons and minor
 *  whitespace; anything weirder than that we just skip. */
function extractWindowAssignment(scriptText: string, varName: string): unknown {
  const re = new RegExp(`window\\.${varName}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;`, 'm');
  const m = scriptText.match(re);
  if (!m || !m[1]) return null;
  return tryParse(m[1]);
}

export function extractFromPayloads(html: string): PayloadResult[] {
  const $ = cheerio.load(html);
  const results: PayloadResult[] = [];

  // ---- Next.js ------------------------------------------------------------
  const nextScript = $('script#__NEXT_DATA__').contents().text();
  if (nextScript) {
    const parsed = tryParse(nextScript);
    if (parsed) {
      const products: PayloadProduct[] = [];
      walkForProducts(parsed, 'next_data', products);
      if (products.length) results.push({ source: 'next_data', products, raw: parsed });
    }
  }

  // Walk every <script> exactly once.
  $('script').each((_, el) => {
    const t = ($(el).attr('type') ?? '').toLowerCase();
    const body = $(el).contents().text();
    if (!body || body.length > 1_500_000) return;

    // ---- Nuxt --------------------------------------------------------------
    if (body.includes('window.__NUXT__')) {
      const parsed = extractWindowAssignment(body, '__NUXT__');
      if (parsed) {
        const products: PayloadProduct[] = [];
        walkForProducts(parsed, 'nuxt', products);
        if (products.length) results.push({ source: 'nuxt', products, raw: parsed });
      }
    }

    // ---- dataLayer ---------------------------------------------------------
    if (body.includes('dataLayer')) {
      const re = /dataLayer\s*=\s*(\[[\s\S]*?\])\s*;?/;
      const m = body.match(re);
      if (m && m[1]) {
        const parsed = tryParse(m[1]);
        if (parsed) {
          const products: PayloadProduct[] = [];
          walkForProducts(parsed, 'datalayer', products);
          if (products.length) results.push({ source: 'datalayer', products, raw: parsed });
        }
      }
    }

    // ---- Shopify analytics meta -------------------------------------------
    if (body.includes('ShopifyAnalytics') && body.includes('meta')) {
      const re = /ShopifyAnalytics\.meta\s*=\s*([\s\S]*?\});/;
      const m = body.match(re);
      if (m && m[1]) {
        const parsed = tryParse(m[1]);
        if (parsed) {
          const products: PayloadProduct[] = [];
          walkForProducts(parsed, 'shopify', products);
          if (products.length) results.push({ source: 'shopify', products, raw: parsed });
        }
      }
    }

    // ---- Magento init -------------------------------------------------------
    if (t === 'text/x-magento-init') {
      const parsed = tryParse(body);
      if (parsed) {
        const products: PayloadProduct[] = [];
        walkForProducts(parsed, 'magento', products);
        if (products.length) results.push({ source: 'magento', products, raw: parsed });
      }
    }
  });

  // ---- Shopify per-product JSON in data-* attributes ----------------------
  const shopifyAttrs: PayloadProduct[] = [];
  $('[data-product-json], [data-product]').each((_, el) => {
    const raw = $(el).attr('data-product-json') ?? $(el).attr('data-product');
    if (!raw) return;
    const parsed = tryParse(raw);
    if (parsed) walkForProducts(parsed, 'shopify', shopifyAttrs);
  });
  if (shopifyAttrs.length) results.push({ source: 'shopify', products: shopifyAttrs });

  // ---- Shopware product info ---------------------------------------------
  const shopwareAttrs: PayloadProduct[] = [];
  $('[data-product-information]').each((_, el) => {
    const raw = $(el).attr('data-product-information');
    if (!raw) return;
    const parsed = tryParse(raw);
    if (parsed) walkForProducts(parsed, 'shopware', shopwareAttrs);
  });
  if (shopwareAttrs.length) results.push({ source: 'shopware', products: shopwareAttrs });

  // ---- WooCommerce variations ---------------------------------------------
  const wooAttrs: PayloadProduct[] = [];
  $('[data-product_variations]').each((_, el) => {
    const raw = $(el).attr('data-product_variations');
    if (!raw) return;
    const parsed = tryParse(raw);
    if (parsed) walkForProducts(parsed, 'woocommerce', wooAttrs);
  });
  if (wooAttrs.length) results.push({ source: 'woocommerce', products: wooAttrs });

  // Deduplicate (some sites repeat product objects across payloads).
  const seen = new Set<string>();
  for (const r of results) {
    r.products = r.products.filter((p) => {
      const key = `${p.title ?? ''}|${p.productUrl ?? ''}|${p.price ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return results.filter((r) => r.products.length > 0);
}
