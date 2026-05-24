import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsScopeCte, bucketExpression } from './analytics-filters';
import { downsample, resolveRollupWindow } from './analytics-rollups';
import type { AnalyticsFilters, MarketTrendPoint } from './types';

interface Row extends Record<string, unknown> {
  bucket: string;
  average_price: string | null;
  median_price: string | null;
  min_price: string | null;
  max_price: string | null;
  average_discount: string | null;
  drops: number;
  increases: number;
  changes: number;
}

export async function getMarketTrends(orgId: string, filters: AnalyticsFilters): Promise<MarketTrendPoint[]> {
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const bucket = bucketExpression(filters, sql`scoped.scraped_at`);
  const rows = await db().execute<Row>(sql`
    with ${scoped},
    sequenced as (
      select
        scoped.*,
        lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price
      from scoped
    )
    select
      ${bucket}::text as bucket,
      avg(price)::numeric(12,2)::text as average_price,
      percentile_cont(0.5) within group (order by price)::numeric(12,2)::text as median_price,
      min(price)::text as min_price,
      max(price)::text as max_price,
      avg(case when old_price is not null and old_price > price then ((old_price - price) / old_price) * 100 else 0 end)::numeric(8,2)::text as average_discount,
      count(*) filter (where previous_price is not null and price < previous_price)::int as drops,
      count(*) filter (where previous_price is not null and price > previous_price)::int as increases,
      count(*) filter (where previous_price is not null and price <> previous_price)::int as changes
    from sequenced scoped
    where price is not null
    group by ${bucket}
    order by ${bucket} asc
  `);
  return downsample(rows.map((row) => ({
    bucket: row.bucket,
    averagePrice: numberOrNull(row.average_price),
    medianPrice: numberOrNull(row.median_price),
    minPrice: numberOrNull(row.min_price),
    maxPrice: numberOrNull(row.max_price),
    averageDiscount: numberOrZero(row.average_discount),
    drops: Number(row.drops ?? 0),
    increases: Number(row.increases ?? 0),
    changes: Number(row.changes ?? 0),
  })), resolveRollupWindow(filters).maxPoints);
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}
