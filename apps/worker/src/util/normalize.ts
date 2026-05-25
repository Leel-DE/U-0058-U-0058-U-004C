import type { Availability } from '../types.js';

const PRICE_REGEX_DEFAULT =
  /(\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{1,4})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d{1,6}(?:[.,]\d{1,4})?)/;

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '₴': 'UAH',
};

/** Parse a raw price text such as "€1.299,00" or "$1,299.99" into a number. */
export function parsePrice(raw: string | null | undefined, customRegex?: string | null): number | undefined {
  if (!raw) return undefined;
  const re = customRegex ? new RegExp(customRegex) : PRICE_REGEX_DEFAULT;
  const m = raw.match(re);
  if (!m) return undefined;
  const matched = (m[1] ?? m[0]).trim();
  // Determine decimal separator: the LAST separator is decimal.
  const lastComma = matched.lastIndexOf(',');
  const lastDot = matched.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = matched.replace(/\./g, '').replace(/\s/g, '').replace(/,/, '.');
  } else if (lastDot > lastComma) {
    normalized = matched.replace(/,/g, '').replace(/\s/g, '');
  } else {
    normalized = matched.replace(/[\s,]/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function detectCurrency(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(sym)) return code;
  }
  if (/грн\.?/i.test(raw)) return 'UAH';
  const m = raw.match(/\b(EUR|USD|GBP|UAH|PLN|CZK|SEK|NOK|DKK|CHF)\b/i);
  return m?.[1]?.toUpperCase();
}

const IN_STOCK = /(in\s*stock|available|on\s*stock|verfügbar|disponible|in\s*magazzyno|w\s*magazynie)/i;
const OUT_OF_STOCK = /(out\s*of\s*stock|sold\s*out|unavailable|nicht\s*verfügbar|non\s*disponible|brak|niedostępn)/i;
const PREORDER = /(pre[-\s]?order|vorbestell|précommande|preorder)/i;
const LIMITED = /(low\s*stock|only\s*\d+\s*left|hurry|limited|wenig)/i;

export function detectAvailability(raw: string | null | undefined): Availability | undefined {
  if (!raw) return undefined;
  if (OUT_OF_STOCK.test(raw)) return 'out_of_stock';
  if (PREORDER.test(raw)) return 'preorder';
  if (LIMITED.test(raw)) return 'limited';
  if (IN_STOCK.test(raw)) return 'in_stock';
  return undefined;
}

export function normalizeAvailability(raw: string | undefined | null): Availability | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes('instock') || v.includes('in_stock')) return 'in_stock';
  if (v.includes('outofstock') || v.includes('out_of_stock')) return 'out_of_stock';
  if (v.includes('preorder')) return 'preorder';
  if (v.includes('limitedavailability') || v.includes('limited')) return 'limited';
  return detectAvailability(raw);
}
