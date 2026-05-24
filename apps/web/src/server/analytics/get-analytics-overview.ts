import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatCurrency, formatPct } from '@/lib/utils';
import { analyticsLatestProductsCte, analyticsScopeCte } from './analytics-filters';
import { calculateFreshnessScore, pctDelta } from './analytics-metrics';
import { getMarketTrends } from './get-market-trends';
import type { AnalyticsFilters, AnalyticsKpi } from './types';

interface OverviewRow extends Record<string, unknown> {
  total_products: number;
  previous_total_products: number;
  active_competitors: number;
  previous_active_competitors: number;
  avg_price: string | null;
  previous_avg_price: string | null;
  median_price: string | null;
  previous_median_price: string | null;
  avg_discount: string | null;
  previous_avg_discount: string | null;
  discounted_products: number;
  previous_discounted_products: number;
  in_stock_products: number;
  previous_in_stock_products: number;
  out_of_stock_products: number;
  previous_out_of_stock_products: number;
  price_changes: number;
  previous_price_changes: number;
  price_drops: number;
  previous_price_drops: number;
  price_increases: number;
  previous_price_increases: number;
  stock_changes: number;
  previous_stock_changes: number;
  stale_products: number;
  low_confidence_products: number;
  previous_low_confidence_products: number;
  failed_extractions: number;
  previous_failed_extractions: number;
  fresh_products: number;
  active_alerts: number;
}

interface BuiltKpi extends AnalyticsKpi {
  previousNumericValue?: number;
}

export async function getAnalyticsOverview(orgId: string, filters: AnalyticsFilters): Promise<AnalyticsKpi[]> {
  const current = analyticsScopeCte('current_scoped', orgId, filters);
  const previous = analyticsScopeCte('previous_scoped', orgId, filters, filters.previousDateFrom, filters.previousDateTo);
  const latest = analyticsLatestProductsCte('latest_products', orgId, filters);
  const [rows, trends] = await Promise.all([
    db().execute<OverviewRow>(sql`
      with ${current}, ${previous}, ${latest},
      current_seq as (
        select
          current_scoped.*,
          lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price,
          lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability
        from current_scoped
      ),
      previous_seq as (
        select
          previous_scoped.*,
          lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price,
          lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability
        from previous_scoped
      )
      select
        (select count(distinct coalesce(product_id, competitor_product_id))::int from latest_products) as total_products,
        (select count(distinct coalesce(product_id, competitor_product_id))::int from previous_scoped) as previous_total_products,
        (select count(distinct competitor_id)::int from current_scoped) as active_competitors,
        (select count(distinct competitor_id)::int from previous_scoped) as previous_active_competitors,
        (select avg(price)::numeric(12,2)::text from current_scoped where price is not null) as avg_price,
        (select avg(price)::numeric(12,2)::text from previous_scoped where price is not null) as previous_avg_price,
        (select percentile_cont(0.5) within group (order by price)::numeric(12,2)::text from current_scoped where price is not null) as median_price,
        (select percentile_cont(0.5) within group (order by price)::numeric(12,2)::text from previous_scoped where price is not null) as previous_median_price,
        (select avg(case when old_price is not null and old_price > price then ((old_price - price) / old_price) * 100 else 0 end)::numeric(8,2)::text from current_scoped where price is not null) as avg_discount,
        (select avg(case when old_price is not null and old_price > price then ((old_price - price) / old_price) * 100 else 0 end)::numeric(8,2)::text from previous_scoped where price is not null) as previous_avg_discount,
        (select count(distinct competitor_product_id)::int from latest_products where old_price is not null and price is not null and old_price > price) as discounted_products,
        (select count(distinct competitor_product_id)::int from previous_scoped where old_price is not null and price is not null and old_price > price) as previous_discounted_products,
        (select count(distinct competitor_product_id)::int from latest_products where availability = 'in_stock') as in_stock_products,
        (select count(distinct competitor_product_id)::int from previous_scoped where availability = 'in_stock') as previous_in_stock_products,
        (select count(distinct competitor_product_id)::int from latest_products where availability = 'out_of_stock') as out_of_stock_products,
        (select count(distinct competitor_product_id)::int from previous_scoped where availability = 'out_of_stock') as previous_out_of_stock_products,
        (select count(*)::int from current_seq where previous_price is not null and price <> previous_price) as price_changes,
        (select count(*)::int from previous_seq where previous_price is not null and price <> previous_price) as previous_price_changes,
        (select count(*)::int from current_seq where previous_price is not null and price < previous_price) as price_drops,
        (select count(*)::int from previous_seq where previous_price is not null and price < previous_price) as previous_price_drops,
        (select count(*)::int from current_seq where previous_price is not null and price > previous_price) as price_increases,
        (select count(*)::int from previous_seq where previous_price is not null and price > previous_price) as previous_price_increases,
        (select count(*)::int from current_seq where previous_availability is not null and availability is not null and previous_availability <> availability) as stock_changes,
        (select count(*)::int from previous_seq where previous_availability is not null and availability is not null and previous_availability <> availability) as previous_stock_changes,
        (select count(*)::int from latest_products where last_scraped_at is null or last_scraped_at < now() - interval '24 hours') as stale_products,
        (select count(*)::int from latest_products where confidence < 0.7) as low_confidence_products,
        (select count(distinct competitor_product_id)::int from previous_scoped where confidence < 0.7) as previous_low_confidence_products,
        (select count(*)::int from current_scoped where snapshot_status <> 'ok') as failed_extractions,
        (select count(*)::int from previous_scoped where snapshot_status <> 'ok') as previous_failed_extractions,
        (select count(*)::int from latest_products where last_scraped_at >= now() - interval '24 hours') as fresh_products,
        (select count(*)::int from alert_rules where org_id = ${orgId} and active = true) as active_alerts
    `),
    getMarketTrends(orgId, filters),
  ]);

  const row = rows[0];
  if (!row) return [];
  const sparkline = trends.map((point) => ({ date: point.bucket, value: point.averagePrice ?? 0 }));
  const total = Number(row.total_products);
  const freshness = calculateFreshnessScore(total, Number(row.fresh_products));
  const avgPrice = numberOrNull(row.avg_price);
  const medianPrice = numberOrNull(row.median_price);
  const avgDiscount = numberOrNull(row.avg_discount) ?? 0;

  const previousFreshness = calculateFreshnessScore(Number(row.previous_total_products), 0);

  return [
    kpi('Total analyzed products', total, total.toLocaleString(), 'neutral', '/products', sparkline, Number(row.previous_total_products)),
    kpi('Total active competitors', Number(row.active_competitors), Number(row.active_competitors).toLocaleString(), 'neutral', '/analytics/competitors', sparkline, Number(row.previous_active_competitors)),
    kpi('Average market price', avgPrice ?? 0, formatCurrency(avgPrice, 'EUR'), 'neutral', '/analytics/market', sparkline, numberOrZero(row.previous_avg_price)),
    kpi('Median market price', medianPrice ?? 0, formatCurrency(medianPrice, 'EUR'), 'neutral', '/analytics/market', sparkline, numberOrZero(row.previous_median_price)),
    kpi('Average discount', avgDiscount, formatPct(avgDiscount), avgDiscount > 15 ? 'warning' : 'neutral', '/analytics/products?discountOnly=true', sparkline, numberOrZero(row.previous_avg_discount)),
    kpi('Products with discounts', Number(row.discounted_products), Number(row.discounted_products).toLocaleString(), 'warning', '/analytics/products?discountOnly=true', sparkline, Number(row.previous_discounted_products)),
    kpi('Products in stock', Number(row.in_stock_products), Number(row.in_stock_products).toLocaleString(), 'good', '/analytics/availability?inStockOnly=true', sparkline, Number(row.previous_in_stock_products)),
    kpi('Out of stock products', Number(row.out_of_stock_products), Number(row.out_of_stock_products).toLocaleString(), Number(row.out_of_stock_products) > 0 ? 'warning' : 'good', '/analytics/availability?availability=out_of_stock', sparkline, Number(row.previous_out_of_stock_products)),
    kpi('Price changes today', Number(row.price_changes), Number(row.price_changes).toLocaleString(), 'neutral', '/analytics/products?changesOnly=true', sparkline, Number(row.previous_price_changes)),
    kpi('Price drops today', Number(row.price_drops), Number(row.price_drops).toLocaleString(), 'good', '/analytics/products?changesOnly=true', sparkline, Number(row.previous_price_drops)),
    kpi('Price increases today', Number(row.price_increases), Number(row.price_increases).toLocaleString(), 'warning', '/analytics/products?changesOnly=true', sparkline, Number(row.previous_price_increases)),
    kpi('Stock changes today', Number(row.stock_changes), Number(row.stock_changes).toLocaleString(), 'warning', '/analytics/availability?stockChangesOnly=true', sparkline, Number(row.previous_stock_changes)),
    kpi('Stale products', Number(row.stale_products), Number(row.stale_products).toLocaleString(), Number(row.stale_products) > 0 ? 'warning' : 'good', '/analytics/data-quality?staleOnly=true', sparkline),
    kpi('Low confidence products', Number(row.low_confidence_products), Number(row.low_confidence_products).toLocaleString(), Number(row.low_confidence_products) > 0 ? 'warning' : 'good', '/analytics/data-quality?lowConfidenceOnly=true', sparkline, Number(row.previous_low_confidence_products)),
    kpi('Failed extractions', Number(row.failed_extractions), Number(row.failed_extractions).toLocaleString(), Number(row.failed_extractions) > 0 ? 'critical' : 'good', '/analytics/data-quality', sparkline, Number(row.previous_failed_extractions)),
    kpi('Active alerts', Number(row.active_alerts), Number(row.active_alerts).toLocaleString(), 'neutral', '/alerts', sparkline, Number(row.active_alerts)),
    kpi('Data freshness score', freshness, `${freshness}%`, freshness < 70 ? 'warning' : 'good', '/analytics/data-quality', sparkline, previousFreshness),
  ].map((item) => ({
    label: item.label,
    numericValue: item.numericValue,
    value: item.value,
    status: item.status,
    href: item.href,
    sparkline: item.sparkline,
    delta: item.previousNumericValue == null ? undefined : pctDelta(item.numericValue, item.previousNumericValue),
  }));
}

function kpi(
  label: string,
  numericValue: number,
  value: string,
  status: AnalyticsKpi['status'],
  href: string,
  sparkline: AnalyticsKpi['sparkline'],
  previousNumericValue?: number,
): BuiltKpi {
  return { label, numericValue, value, status, href, sparkline, previousNumericValue };
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}
