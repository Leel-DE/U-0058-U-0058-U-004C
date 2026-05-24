import type { CheerioAPI } from 'cheerio';
import type { Extracted } from '../types';
import { normalizeAvailability } from '../util/normalize';

export function parseOpenGraph($: CheerioAPI): Extracted | null {
  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr('content') ??
    $(`meta[name="${name}"]`).attr('content');

  const title = meta('og:title') ?? $('title').first().text() ?? undefined;
  const image = meta('og:image');
  const priceRaw = meta('product:price:amount') ?? meta('og:price:amount');
  const currency = meta('product:price:currency') ?? meta('og:price:currency');
  const availabilityRaw = meta('product:availability') ?? meta('og:availability');

  const price = priceRaw ? Number(priceRaw) : undefined;
  if (!title && !price) return null;
  return {
    title: title ?? undefined,
    price: Number.isFinite(price) ? price : undefined,
    currency: currency?.toUpperCase(),
    image: image ?? undefined,
    availability: normalizeAvailability(availabilityRaw ?? null),
  };
}
