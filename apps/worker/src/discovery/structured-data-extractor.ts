/**
 * Extract product information from schema.org JSON-LD blocks embedded in the
 * page (`<script type="application/ld+json">`). Sites that bother to publish
 * structured data are the highest-confidence source: no DOM scoring needed.
 *
 * Supports:
 *   - @type=Product (single product page or one card per script)
 *   - @type=ItemList with itemListElement[*].item.@type=Product
 *   - @graph nesting
 *   - arrays of products at the root
 */
import * as cheerio from 'cheerio';

export interface StructuredProduct {
  title?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  productUrl?: string;
  imageUrl?: string;
  availability?: string;
  brand?: string;
  rating?: number;
  sku?: string;
  gtin?: string;
  source: 'json-ld';
}

interface JsonLdOffer {
  '@type'?: string | string[];
  price?: number | string;
  priceCurrency?: string;
  availability?: string;
  priceSpecification?: { price?: number | string; priceCurrency?: string };
  highPrice?: number | string;
  lowPrice?: number | string;
}

interface JsonLdProduct {
  '@type'?: string | string[];
  name?: string;
  url?: string;
  image?: string | string[] | { url?: string };
  brand?: string | { name?: string };
  sku?: string;
  gtin?: string;
  gtin13?: string;
  gtin12?: string;
  gtin8?: string;
  aggregateRating?: { ratingValue?: number | string };
  offers?: JsonLdOffer | JsonLdOffer[];
}

interface JsonLdItemList {
  '@type'?: string | string[];
  itemListElement?: Array<{
    '@type'?: string;
    item?: JsonLdProduct;
    url?: string;
    position?: number;
  }>;
}

type JsonLdNode = JsonLdProduct | JsonLdItemList | { '@graph'?: unknown };

function typesOf(node: { '@type'?: string | string[] } | null | undefined): string[] {
  if (!node?.['@type']) return [];
  return (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).map((t) =>
    typeof t === 'string' ? t.toLowerCase() : '',
  );
}

function isProduct(n: unknown): n is JsonLdProduct {
  return typesOf(n as { '@type'?: string }).includes('product');
}

function isItemList(n: unknown): n is JsonLdItemList {
  return typesOf(n as { '@type'?: string }).includes('itemlist');
}

/** Flatten JSON-LD into a list of top-level nodes. Does NOT recurse into
 *  `itemListElement` here — that's iterated by `extractStructuredProducts`,
 *  otherwise a Product appears both as a list-member node and as the list
 *  itself, double-counting cards. */
function collect(node: unknown, out: object[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (typeof node !== 'object') return;
  out.push(node as object);
  const graph = (node as { '@graph'?: unknown })['@graph'];
  if (graph) collect(graph, out);
}

function toNumber(v: number | string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function normalizeAvailability(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes('instock') || v.includes('in_stock')) return 'in_stock';
  if (v.includes('outofstock') || v.includes('out_of_stock')) return 'out_of_stock';
  if (v.includes('preorder')) return 'preorder';
  if (v.includes('limitedavailability') || v.includes('limited')) return 'limited';
  return undefined;
}

function toProduct(p: JsonLdProduct): StructuredProduct | null {
  const name = typeof p.name === 'string' ? p.name : undefined;
  let offer: JsonLdOffer | undefined;
  if (Array.isArray(p.offers)) offer = p.offers[0];
  else if (p.offers) offer = p.offers;

  const price = toNumber(offer?.price ?? offer?.priceSpecification?.price ?? offer?.lowPrice);
  const oldPrice = toNumber(offer?.highPrice);
  const currency = (offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency)?.toUpperCase();
  const image = Array.isArray(p.image)
    ? typeof p.image[0] === 'string'
      ? p.image[0]
      : undefined
    : typeof p.image === 'string'
      ? p.image
      : (p.image as { url?: string } | undefined)?.url;
  const brand = typeof p.brand === 'string' ? p.brand : p.brand?.name;
  const rating = toNumber(p.aggregateRating?.ratingValue);
  const gtin = p.gtin ?? p.gtin13 ?? p.gtin12 ?? p.gtin8;

  if (!name && !price && !p.url) return null;
  return {
    title: name,
    price,
    oldPrice: oldPrice != null && price != null && oldPrice > price ? oldPrice : undefined,
    currency,
    productUrl: p.url,
    imageUrl: image,
    availability: normalizeAvailability(offer?.availability),
    brand,
    rating,
    sku: p.sku,
    gtin,
    source: 'json-ld',
  };
}

/**
 * Pull every Product node out of the JSON-LD blocks. Whether the page is a
 * single Product detail or an ItemList of N Products on a category page,
 * this returns the flat array of Product entries with absolute URLs left
 * to the caller.
 */
export function extractStructuredProducts(html: string): StructuredProduct[] {
  const $ = cheerio.load(html);
  const blocks: object[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed: JsonLdNode = JSON.parse(raw);
      collect(parsed, blocks);
    } catch {
      // ignore malformed JSON-LD blocks
    }
  });
  const products: StructuredProduct[] = [];
  for (const node of blocks) {
    if (isProduct(node)) {
      const p = toProduct(node);
      if (p) products.push(p);
    } else if (isItemList(node)) {
      for (const li of node.itemListElement ?? []) {
        if (li.item && isProduct(li.item)) {
          const p = toProduct(li.item);
          if (p) {
            if (!p.productUrl && li.url) p.productUrl = li.url;
            products.push(p);
          }
        }
      }
    }
  }
  return products;
}
