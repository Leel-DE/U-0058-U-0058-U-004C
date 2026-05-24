import type { ProductTrend } from './types';

const STOP_WORDS = new Set([
  'bike',
  'bikes',
  'bicycle',
  'fahrrad',
  'fahrrader',
  'e-bike',
  'ebike',
  'e',
  'mtb',
  'bike',
  'black',
  'white',
  'red',
  'blue',
  'green',
  'grey',
  'gray',
  'm',
  'l',
  'xl',
]);

export function normalizeProductTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/["'`´]/g, '')
    .replace(/[|/,_:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function productKey(title: string, brand?: string | null): string {
  const normalized = normalizeProductTitle(`${brand ?? ''} ${title}`).toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .slice(0, 10);
  return Array.from(new Set(tokens)).join('-');
}

export function tokenizeProductTitle(title: string): string[] {
  return normalizeProductTitle(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function inferTrend(firstPrice: number | null, lastPrice: number | null, volatility: number): ProductTrend {
  if (firstPrice == null || lastPrice == null || firstPrice <= 0) return 'unknown';
  if (volatility >= 12) return 'volatile';
  const pct = ((lastPrice - firstPrice) / firstPrice) * 100;
  if (pct <= -3) return 'falling';
  if (pct >= 3) return 'rising';
  return 'stable';
}

export function confidenceFromSignals(input: {
  matched: boolean;
  competitorsCount: number;
  hasGtin?: boolean;
  hasSku?: boolean;
  hasBrand?: boolean;
  hasPrice?: boolean;
}): number {
  let score = input.matched ? 0.62 : 0.42;
  if (input.competitorsCount > 1) score += 0.12;
  if (input.hasGtin) score += 0.14;
  if (input.hasSku) score += 0.08;
  if (input.hasBrand) score += 0.06;
  if (input.hasPrice) score += 0.05;
  return Math.min(0.98, Number(score.toFixed(2)));
}

export function titleSimilarity(a: string, b: string): number {
  const left = new Set(tokenizeProductTitle(a));
  const right = new Set(tokenizeProductTitle(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap++;
  }
  return overlap / Math.max(left.size, right.size);
}
