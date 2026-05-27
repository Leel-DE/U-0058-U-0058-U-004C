import type { CheerioAPI } from 'cheerio';
import type { Extracted, ScrapingRules } from '../types.js';
import { detectAvailability, detectCurrency, parsePrice } from '../util/normalize.js';

export function parseSelectors($: CheerioAPI, rules: ScrapingRules): Extracted | null {
  const get = (sel: string | null | undefined) => {
    if (!sel) return undefined;
    const el = $(sel).first();
    if (!el.length) return undefined;
    const txt = (el.attr('content') ?? el.attr('value') ?? el.attr('aria-label') ?? el.attr('title') ?? el.text()).trim();
    return txt || undefined;
  };
  const getAttr = (sel: string | null | undefined, attr: string) => {
    if (!sel) return undefined;
    const el = $(sel).first();
    if (!el.length) return undefined;
    return el.attr(attr) || undefined;
  };

  const title = get(rules.titleSelector);
  const priceText = get(rules.priceSelector);
  const oldPriceText = get(rules.oldPriceSelector);
  const availabilityText = get(rules.availabilitySelector);
  const image = getAttr(rules.imageSelector, 'src') ?? getAttr(rules.imageSelector, 'data-src') ?? getAttr(rules.imageSelector, 'content');
  const sku = get(rules.skuSelector);
  const category = get(rules.breadcrumbsSelector);
  const shipping = get(rules.shippingSelector);
  const ratingText = get(rules.ratingSelector);

  const price = parsePrice(priceText, rules.priceRegex);
  const oldPrice = parsePrice(oldPriceText, rules.priceRegex);
  const currency = detectCurrency(priceText);
  const availability = detectAvailability(availabilityText);
  const rating = ratingText ? Number(ratingText.replace(',', '.').match(/[\d.]+/)?.[0]) : undefined;

  if (!title && price == null) return null;
  return {
    title,
    price,
    oldPrice,
    currency,
    image,
    sku,
    category,
    shipping,
    availability,
    rating: Number.isFinite(rating) ? rating : undefined,
  };
}
