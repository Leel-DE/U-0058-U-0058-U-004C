import type { ProductStockStatus } from './types';

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function discountPct(price: number | null, oldPrice: number | null): number | null {
  if (price == null || oldPrice == null || oldPrice <= price) return null;
  return ((oldPrice - price) / oldPrice) * 100;
}

export function volatilityScore(minPrice: number | null, maxPrice: number | null, avgPrice: number | null): number {
  if (minPrice == null || maxPrice == null || avgPrice == null || avgPrice <= 0) return 0;
  return Number((((maxPrice - minPrice) / avgPrice) * 100).toFixed(1));
}

export function stockStatus(inStock: number, outOfStock: number, unknown: number): ProductStockStatus {
  const total = inStock + outOfStock + unknown;
  if (total === 0) return 'unknown';
  if (inStock > 0 && outOfStock > 0) return 'mixed';
  if (inStock > 0) return 'in_stock';
  if (outOfStock > 0) return 'out_of_stock';
  return 'unknown';
}

export function stockRatio(inStock: number, total: number): number {
  if (total <= 0) return 0;
  return Number((inStock / total).toFixed(2));
}

export function priceRangeLabel(price: number | null): string {
  if (price == null) return 'missing price';
  if (price < 500) return '< 500';
  if (price < 1500) return '500-1499';
  if (price < 3000) return '1500-2999';
  if (price < 5000) return '3000-4999';
  return '5000+';
}
