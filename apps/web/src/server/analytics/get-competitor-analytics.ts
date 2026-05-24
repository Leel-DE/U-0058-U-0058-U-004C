import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsScopeCte } from './analytics-filters';
import { calculateAggressivenessScore, calculateDataQualityScore } from './analytics-metrics';
import type { AnalyticsFilters, CompetitorAnalyticsRow } from './types';

interface Row extends Record<string, unknown> {
  competitor_id: string;
  competitor_name: string;
  monitored_products: number;
  avg_price: string | null;
  median_price: string | null;
  avg_discount: string | null;
  in_stock: number;
  total_stock: number;
  price_changes: number;
  price_drops: number;
  price_increases: number;
  stock_changes: number;
  failed_scrapes: number;
  last_crawl: string | null;
  min_price: string | null;
  max_price: string | null;
  avg_confidence: string | null;
  ok_count: number;
  total_count: number;
}

export async function getCompetitorAnalytics(orgId: string, filters: AnalyticsFilters): Promise<CompetitorAnalyticsRow[]> {
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const fromValue = filters.dateFrom?.toISOString() ?? null;
  const rows = await db().execute<Row>(sql`
    with ${scoped},
    sequenced as (
      select
        scoped.*,
        lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price,
        lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability
      from scoped
    ),
    scrape_failures as (
      select store_id::text as competitor_id, count(*)::int as failed_scrapes, max(coalesce(finished_at, started_at, created_at))::text as last_crawl
      from scrape_runs
      where org_id = ${orgId}
        and (${fromValue}::timestamptz is null or created_at >= ${fromValue}::timestamptz)
        and status = 'failed'
      group by store_id
    )
    select
      competitor_id,
      competitor_name,
      count(distinct competitor_product_id)::int as monitored_products,
      avg(price)::numeric(12,2)::text as avg_price,
      percentile_cont(0.5) within group (order by price)::numeric(12,2)::text as median_price,
      avg(case when old_price is not null and old_price > price then ((old_price - price) / old_price) * 100 else 0 end)::numeric(8,2)::text as avg_discount,
      count(distinct competitor_product_id) filter (where availability = 'in_stock')::int as in_stock,
      count(distinct competitor_product_id)::int as total_stock,
      count(*) filter (where previous_price is not null and price <> previous_price)::int as price_changes,
      count(*) filter (where previous_price is not null and price < previous_price)::int as price_drops,
      count(*) filter (where previous_price is not null and price > previous_price)::int as price_increases,
      count(*) filter (where previous_availability is not null and availability is not null and previous_availability <> availability)::int as stock_changes,
      coalesce(max(sf.failed_scrapes), 0)::int as failed_scrapes,
      greatest(max(scraped_at), max(sf.last_crawl::timestamptz))::text as last_crawl,
      min(price)::text as min_price,
      max(price)::text as max_price,
      avg(confidence)::numeric(4,3)::text as avg_confidence,
      count(*) filter (where snapshot_status = 'ok')::int as ok_count,
      count(*)::int as total_count
    from sequenced
    left join scrape_failures sf using (competitor_id)
    group by competitor_id, competitor_name
    order by price_changes desc, monitored_products desc
    limit 100
  `);

  return rows.map((row) => {
    const avgPrice = numberOrNull(row.avg_price);
    const minPrice = numberOrNull(row.min_price);
    const maxPrice = numberOrNull(row.max_price);
    const priceDrops = Number(row.price_drops ?? 0);
    const priceChanges = Number(row.price_changes ?? 0);
    const stockChanges = Number(row.stock_changes ?? 0);
    const failedScrapes = Number(row.failed_scrapes ?? 0);
    const avgConfidence = numberOrNull(row.avg_confidence) ?? 0;
    return {
      competitorId: row.competitor_id,
      competitorName: row.competitor_name,
      monitoredProducts: Number(row.monitored_products ?? 0),
      avgPrice,
      medianPrice: numberOrNull(row.median_price),
      avgDiscount: numberOrZero(row.avg_discount),
      stockRatio: Number(row.total_stock) > 0 ? Number((Number(row.in_stock) / Number(row.total_stock)).toFixed(2)) : 0,
      priceChanges,
      priceDrops,
      priceIncreases: Number(row.price_increases ?? 0),
      stockChanges,
      failedScrapes,
      lastCrawl: row.last_crawl,
      aggressivenessScore: calculateAggressivenessScore({
        priceDrops,
        discountedProducts: Math.round(numberOrZero(row.avg_discount)),
        priceChanges,
        stockChanges,
        failedScrapes,
      }),
      volatilityScore: avgPrice && minPrice != null && maxPrice != null ? Number((((maxPrice - minPrice) / avgPrice) * 100).toFixed(1)) : 0,
      dataQualityScore: calculateDataQualityScore({
        hasPrice: avgPrice != null,
        hasTitle: true,
        confidence: avgConfidence,
        recentChecked: Boolean(row.last_crawl),
        extractionSuccess: Number(row.total_count) > 0 && Number(row.ok_count) / Number(row.total_count) >= 0.8,
        validUrl: true,
      }),
    };
  });
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}
