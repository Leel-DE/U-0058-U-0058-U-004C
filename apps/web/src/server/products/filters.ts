import type { ProductGroupBy, ProductIntelligenceFilters } from './types';

const GROUPS = new Set<ProductGroupBy>([
  'none',
  'brand',
  'category',
  'competitor',
  'stock',
  'volatility',
  'discount',
  'price_range',
]);

export function parseProductFilters(input: Record<string, string | string[] | undefined>): ProductIntelligenceFilters {
  const page = positiveInt(one(input.page), 1);
  const pageSize = Math.min(100, positiveInt(one(input.pageSize), 50));
  const groupBy = GROUPS.has(one(input.groupBy) as ProductGroupBy) ? (one(input.groupBy) as ProductGroupBy) : 'none';
  return {
    search: clean(one(input.search)),
    category: clean(one(input.category)),
    brand: clean(one(input.brand)),
    competitor: clean(one(input.competitor)),
    availability: clean(one(input.availability)),
    stock: clean(one(input.stock)),
    discount: clean(one(input.discount)),
    advanced: clean(one(input.advanced)),
    groupBy,
    sort: clean(one(input.sort)) ?? 'updated_desc',
    page,
    pageSize,
    minPrice: numberValue(one(input.minPrice)),
    maxPrice: numberValue(one(input.maxPrice)),
    specs: {
      motor: clean(one(input.motor)) ?? '',
      battery: clean(one(input.battery)) ?? '',
      wheelSize: clean(one(input.wheelSize)) ?? '',
      travel: clean(one(input.travel)) ?? '',
      frameMaterial: clean(one(input.frameMaterial)) ?? '',
      drivetrain: clean(one(input.drivetrain)) ?? '',
      brakes: clean(one(input.brakes)) ?? '',
      weight: clean(one(input.weight)) ?? '',
      year: clean(one(input.year)) ?? '',
    },
  };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'all' || trimmed === 'none') return undefined;
  return trimmed.slice(0, 120);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}
