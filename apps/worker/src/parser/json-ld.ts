import type { CheerioAPI } from 'cheerio';
import type { Extracted } from '../types';
import { normalizeAvailability } from '../util/normalize';

interface JsonLdProduct {
  '@type'?: string | string[];
  name?: string;
  brand?: { name?: string } | string;
  image?: string | string[];
  offers?: JsonLdOffer | JsonLdOffer[];
  aggregateRating?: { ratingValue?: number | string };
}

interface JsonLdOffer {
  '@type'?: string;
  price?: number | string;
  priceCurrency?: string;
  availability?: string;
  priceSpecification?: { price?: number | string; priceCurrency?: string };
}

function isProduct(node: { '@type'?: string | string[] } | null | undefined): node is JsonLdProduct {
  if (!node || !node['@type']) return false;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product');
}

function collectNodes(json: unknown, out: object[]): void {
  if (!json) return;
  if (Array.isArray(json)) {
    for (const item of json) collectNodes(item, out);
    return;
  }
  if (typeof json !== 'object') return;
  const obj = json as { '@graph'?: unknown };
  out.push(json as object);
  if (obj['@graph']) collectNodes(obj['@graph'], out);
}

export function parseJsonLd($: CheerioAPI): Extracted | null {
  const nodes: object[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text().trim();
    if (!txt) return;
    try {
      collectNodes(JSON.parse(txt), nodes);
    } catch {
      // ignore malformed JSON-LD blocks
    }
  });
  const product = nodes.find(isProduct);
  if (!product) return null;

  let offer: JsonLdOffer | undefined;
  if (Array.isArray(product.offers)) {
    offer = product.offers[0];
  } else if (product.offers) {
    offer = product.offers;
  }

  const price = offer?.price ?? offer?.priceSpecification?.price;
  const currency = offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency;
  const numericPrice = price != null ? Number(price) : undefined;

  const image = Array.isArray(product.image) ? product.image[0] : product.image;
  const rating = product.aggregateRating?.ratingValue;
  const numericRating = rating != null ? Number(rating) : undefined;

  return {
    title: product.name,
    price: Number.isFinite(numericPrice) ? numericPrice : undefined,
    currency: currency?.toUpperCase(),
    availability: normalizeAvailability(offer?.availability ?? null),
    image,
    rating: Number.isFinite(numericRating) ? numericRating : undefined,
  };
}
