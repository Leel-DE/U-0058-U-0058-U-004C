import type { CheerioAPI } from 'cheerio';
import type { Extracted } from '../types.js';
import { detectAvailability, detectCurrency, parsePrice } from '../util/normalize.js';

const PRICE_CANDIDATE =
  /(?:\u20ac|EUR)\s*\d[\d.\s]*(?:[,.]\d{1,2}|,-)?|\d[\d.\s]*(?:[,.]\d{1,2}|,-)?\s*(?:\u20ac|EUR)/gi;
const BARE_EU_THOUSANDS_PRICE = /\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2}|,-)?/g;

const TITLE_NOISE =
  /(filiale|warenkorb|leasing|versand|farbe|größe|bestimmen|reduziert|menu|suche|konto|wishlist|inkl\.|mwst|lieferung)/i;

function normalizeLine(line: string) {
  return line.replace(/\s+/g, ' ').trim();
}

function isUsefulTitleLine(line: string) {
  if (line.length < 14 || line.length > 220) return false;
  if (TITLE_NOISE.test(line)) return false;
  if (PRICE_CANDIDATE.test(line)) return false;
  PRICE_CANDIDATE.lastIndex = 0;
  if (/^[A-ZÄÖÜ0-9\s.-]{2,24}$/.test(line)) return false;
  return true;
}

function pickTitle($: CheerioAPI, lines: string[], firstPriceLineIndex: number) {
  const semantic = $('[itemprop="name"], h1, [data-testid*="title" i], [data-test*="title" i]')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  if (isUsefulTitleLine(semantic)) return semantic;

  const beforePrice = lines.slice(0, firstPriceLineIndex > 0 ? firstPriceLineIndex : lines.length);
  for (let i = beforePrice.length - 1; i >= 0; i -= 1) {
    const line = beforePrice[i];
    if (line && isUsefulTitleLine(line)) return line;
  }
  return lines.find(isUsefulTitleLine);
}

function pickImage($: CheerioAPI) {
  const ignored = /(logo|icon|sprite|placeholder|payment|rating|star|flag)/i;
  const candidates = $('img')
    .toArray()
    .map((img) => {
      const el = $(img);
      return {
        src: el.attr('src') ?? el.attr('data-src') ?? el.attr('srcset')?.split(/\s+/)[0],
        label: `${el.attr('alt') ?? ''} ${el.attr('class') ?? ''} ${el.attr('id') ?? ''}`,
      };
    })
    .filter((candidate) => candidate.src && !ignored.test(candidate.src) && !ignored.test(candidate.label));
  return candidates[0]?.src;
}

function parseVisiblePrice(raw: string) {
  if (/,-/.test(raw)) {
    const whole = raw.split(',-')[0]?.replace(/[^\d.,\s]/g, '').replace(/[.\s,]/g, '');
    const value = whole ? Number(whole) : undefined;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  }
  return parsePrice(raw);
}

function detectVisibleCurrency(raw: string) {
  if (/\u20ac|\bEUR\b/i.test(raw)) return 'EUR';
  return detectCurrency(raw);
}

export function parseVisibleText($: CheerioAPI): Extracted | null {
  const bodyText = $('body').text().replace(/\u00a0/g, ' ');
  const lines = bodyText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const compactText = lines.join('\n');
  const matches = [
    ...[...compactText.matchAll(PRICE_CANDIDATE)].map((match) => match[0]),
    ...[...compactText.matchAll(BARE_EU_THOUSANDS_PRICE)].map((match) => match[0]),
  ];
  PRICE_CANDIDATE.lastIndex = 0;
  BARE_EU_THOUSANDS_PRICE.lastIndex = 0;
  const prices = matches
    .map((raw) => ({ raw, value: parseVisiblePrice(raw) }))
    .filter((candidate): candidate is { raw: string; value: number } => candidate.value != null && candidate.value > 0);
  const firstPrice = prices[0];
  const firstPriceLineIndex = firstPrice
    ? lines.findIndex((line) => line.includes(firstPrice.raw) || line.includes(firstPrice.raw.replace(/\s+/g, ' ')))
    : -1;
  const title = pickTitle($, lines, firstPriceLineIndex);
  const oldPrice = firstPrice ? prices.find((candidate) => candidate.value > firstPrice.value)?.value : undefined;
  if (!title && !firstPrice) return null;

  return {
    title,
    price: firstPrice?.value,
    oldPrice,
    currency: detectVisibleCurrency(firstPrice?.raw ?? compactText),
    availability: detectAvailability(compactText),
    image: pickImage($),
  };
}
