export function calculateMedian(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid] ?? null;
  return Number((((clean[mid - 1] ?? 0) + (clean[mid] ?? 0)) / 2).toFixed(2));
}

export function calculateDiscountPct(price: number | null | undefined, oldPrice: number | null | undefined): number {
  if (price == null || oldPrice == null || oldPrice <= 0 || oldPrice <= price) return 0;
  return Number((((oldPrice - price) / oldPrice) * 100).toFixed(2));
}

export function calculateAggressivenessScore(input: {
  priceDrops: number;
  discountedProducts: number;
  priceChanges: number;
  stockChanges: number;
  failedScrapes: number;
}): number {
  const raw =
    input.priceDrops * 2 +
    input.discountedProducts * 1.5 +
    input.priceChanges +
    input.stockChanges * 0.5 +
    input.failedScrapes * 0.5;
  return clamp(raw * 5, 0, 100);
}

export function calculateCategoryVolatilityScore(input: {
  minPrice?: number | null;
  maxPrice?: number | null;
  avgPrice?: number | null;
  priceChangeCount: number;
}): number {
  const rangePct =
    input.minPrice != null && input.maxPrice != null && input.avgPrice != null && input.avgPrice > 0
      ? ((input.maxPrice - input.minPrice) / input.avgPrice) * 100
      : 0;
  return clamp(rangePct * 0.7 + input.priceChangeCount * 5, 0, 100);
}

export function calculateDataQualityScore(input: {
  hasPrice: boolean;
  hasTitle: boolean;
  confidence: number;
  recentChecked: boolean;
  extractionSuccess: boolean;
  validUrl: boolean;
}): number {
  const score =
    (input.hasPrice ? 22 : 0) +
    (input.hasTitle ? 16 : 0) +
    clamp(input.confidence, 0, 1) * 22 +
    (input.recentChecked ? 16 : 0) +
    (input.extractionSuccess ? 16 : 0) +
    (input.validUrl ? 8 : 0);
  return Math.round(score);
}

export function calculateFreshnessScore(total: number, fresh: number): number {
  if (total <= 0) return 0;
  return Math.round((fresh / total) * 100);
}

export function pctDelta(current: number, previous: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}
