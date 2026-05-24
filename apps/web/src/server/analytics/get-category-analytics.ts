import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsScopeCte } from './analytics-filters';
import { calculateCategoryVolatilityScore } from './analytics-metrics';
import type { AnalyticsFilters, CategoryAnalyticsRow } from './types';

interface Row extends Record<string, unknown> {
  category_id: string | null;
  category: string;
  products_count: number;
  competitors_count: number;
  avg_price: string | null;
  median_price: string | null;
  min_price: string | null;
  max_price: string | null;
  avg_discount: string | null;
  in_stock: number;
  total_stock: number;
  price_changes: number;
  first_price: string | null;
  last_price: string | null;
}

export async function getCategoryAnalytics(orgId: string, filters: AnalyticsFilters): Promise<CategoryAnalyticsRow[]> {
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const rows = await db().execute<Row>(sql`
    with ${scoped},
    sequenced as (
      select
        scoped.*,
        lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price,
        first_value(price) over (partition by coalesce(category_name, 'Uncategorized') order by scraped_at) as first_price,
        first_value(price) over (partition by coalesce(category_name, 'Uncategorized') order by scraped_at desc) as last_price
      from scoped
    )
    select
      category_id,
      coalesce(category_name, 'Uncategorized') as category,
      count(distinct coalesce(product_id, competitor_product_id))::int as products_count,
      count(distinct competitor_id)::int as competitors_count,
      avg(price)::numeric(12,2)::text as avg_price,
      percentile_cont(0.5) within group (order by price)::numeric(12,2)::text as median_price,
      min(price)::text as min_price,
      max(price)::text as max_price,
      avg(case when old_price is not null and old_price > price then ((old_price - price) / old_price) * 100 else 0 end)::numeric(8,2)::text as avg_discount,
      count(distinct competitor_product_id) filter (where availability = 'in_stock')::int as in_stock,
      count(distinct competitor_product_id)::int as total_stock,
      count(*) filter (where previous_price is not null and price <> previous_price)::int as price_changes,
      (array_agg(first_price) filter (where first_price is not null))[1]::text as first_price,
      (array_agg(last_price) filter (where last_price is not null))[1]::text as last_price
    from sequenced
    group by category_id, coalesce(category_name, 'Uncategorized')
    order by price_changes desc, products_count desc
    limit 100
  `);

  return rows.map((row) => {
    const avgPrice = numberOrNull(row.avg_price);
    const minPrice = numberOrNull(row.min_price);
    const maxPrice = numberOrNull(row.max_price);
    return {
      category: row.category,
      categoryId: row.category_id,
      productsCount: Number(row.products_count ?? 0),
      competitorsCount: Number(row.competitors_count ?? 0),
      avgPrice,
      medianPrice: numberOrNull(row.median_price),
      minPrice,
      maxPrice,
      avgDiscount: numberOrZero(row.avg_discount),
      stockRatio: Number(row.total_stock) > 0 ? Number((Number(row.in_stock) / Number(row.total_stock)).toFixed(2)) : 0,
      volatilityScore: calculateCategoryVolatilityScore({
        minPrice,
        maxPrice,
        avgPrice,
        priceChangeCount: Number(row.price_changes ?? 0),
      }),
      priceChanges: Number(row.price_changes ?? 0),
      trend: trend(numberOrNull(row.first_price), numberOrNull(row.last_price)),
    };
  });
}

function trend(first: number | null, last: number | null): CategoryAnalyticsRow['trend'] {
  if (first == null || last == null || first <= 0) return 'unknown';
  const pct = ((last - first) / first) * 100;
  if (pct <= -3) return 'falling';
  if (pct >= 3) return 'rising';
  return 'stable';
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}
