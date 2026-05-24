import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsScopeCte, bucketExpression } from './analytics-filters';
import { downsample, resolveRollupWindow } from './analytics-rollups';
import type { AnalyticsFilters, AvailabilityAnalytics, AvailabilityPoint, ProductMovementRow } from './types';

interface TrendRow extends Record<string, unknown> {
  bucket: string;
  in_stock: number;
  out_of_stock: number;
  unknown_count: number;
  newly_unavailable: number;
  back_in_stock: number;
}

interface ProductRow extends Record<string, unknown> {
  product_id: string | null;
  competitor_product_id: string;
  product_title: string;
  competitor_name: string;
  availability: string | null;
  previous_availability: string | null;
  timestamp: string | null;
  metric: number;
}

export async function getAvailabilityAnalytics(orgId: string, filters: AnalyticsFilters): Promise<AvailabilityAnalytics> {
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const bucket = bucketExpression(filters, sql`sequenced.scraped_at`);
  const [trendRows, productRows] = await Promise.all([
    db().execute<TrendRow>(sql`
      with ${scoped},
      sequenced as (
        select
          scoped.*,
          lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability
        from scoped
      )
      select
        ${bucket}::text as bucket,
        count(distinct competitor_product_id) filter (where availability = 'in_stock')::int as in_stock,
        count(distinct competitor_product_id) filter (where availability = 'out_of_stock')::int as out_of_stock,
        count(distinct competitor_product_id) filter (where availability is null or availability = 'unknown')::int as unknown_count,
        count(*) filter (where previous_availability is distinct from 'out_of_stock' and availability = 'out_of_stock')::int as newly_unavailable,
        count(*) filter (where previous_availability = 'out_of_stock' and availability = 'in_stock')::int as back_in_stock
      from sequenced
      group by ${bucket}
      order by ${bucket} asc
    `),
    db().execute<ProductRow>(sql`
      with ${scoped},
      sequenced as (
        select
          scoped.*,
          lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability
        from scoped
      )
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, cp_title, cp_url) as product_title,
        competitor_name,
        availability,
        previous_availability,
        scraped_at::text as timestamp,
        count(*) over (partition by competitor_product_id)::int as metric
      from sequenced
      where (previous_availability is not null and availability is not null and previous_availability <> availability)
         or availability = 'out_of_stock'
      order by scraped_at desc
      limit 150
    `),
  ]);

  const trend: AvailabilityPoint[] = downsample(trendRows.map((row) => ({
    bucket: row.bucket,
    inStock: Number(row.in_stock ?? 0),
    outOfStock: Number(row.out_of_stock ?? 0),
    unknown: Number(row.unknown_count ?? 0),
    newlyUnavailable: Number(row.newly_unavailable ?? 0),
    backInStock: Number(row.back_in_stock ?? 0),
  })), resolveRollupWindow(filters).maxPoints);

  const latest = trend[trend.length - 1];
  const distribution = latest
    ? [
      { name: 'in stock', value: latest.inStock },
      { name: 'out of stock', value: latest.outOfStock },
      { name: 'unknown', value: latest.unknown },
    ]
    : [];

  const mapped = productRows.map(mapProduct);
  return {
    trend,
    distribution,
    newlyUnavailable: productRows
      .filter((row) => row.previous_availability !== 'out_of_stock' && row.availability === 'out_of_stock')
      .map(mapProduct)
      .slice(0, 25),
    backInStock: productRows
      .filter((row) => row.previous_availability === 'out_of_stock' && row.availability === 'in_stock')
      .map(mapProduct)
      .slice(0, 25),
    unstableAvailability: mapped.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0)).slice(0, 25),
  };
}

function mapProduct(row: ProductRow): ProductMovementRow {
  const competitorProductId = row.competitor_product_id;
  return {
    productId: row.product_id ?? competitorProductId,
    competitorProductId,
    productTitle: row.product_title,
    competitorName: row.competitor_name,
    oldPrice: null,
    newPrice: null,
    currency: 'EUR',
    deltaAmount: null,
    deltaPct: null,
    timestamp: row.timestamp,
    metric: Number(row.metric ?? 0),
    href: row.product_id ? `/products/${row.product_id}` : `/competitors/products/${competitorProductId}`,
  };
}
