import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { calculateFreshness, calculatePctDelta } from './helpers';
import { rangeFilter, storeFilter } from './sql';
import type { DashboardFilters, DashboardKpi } from './types';

interface OverviewRow extends Record<string, unknown> {
  total_competitors: number;
  active_competitors: number;
  total_products: number;
  products_in_stock: number;
  products_out_of_stock: number;
  price_changes: number;
  price_drops: number;
  price_increases: number;
  active_alerts: number;
  failed_runs: number;
  last_successful_crawl: string | null;
  fresh_products: number;
}

interface PreviousRow extends Record<string, unknown> {
  price_changes: number;
  price_drops: number;
  price_increases: number;
  failed_runs: number;
}

export async function getDashboardOverview(orgId: string, filters: DashboardFilters): Promise<DashboardKpi[]> {
  const [row] = await db().execute<OverviewRow>(sql`
    with scoped_stores as (
      select st.*
      from stores st
      where st.org_id = ${orgId}
      ${storeFilter(filters)}
    ),
    scoped_products as (
      select cp.*
      from competitor_products cp
      join scoped_stores st on st.id = cp.store_id
      where cp.org_id = ${orgId}
    ),
    priced as (
      select ps.*,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price
      from price_snapshots ps
      join scoped_products cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}::timestamptz
    )
    select
      (select count(*)::int from stores st where st.org_id = ${orgId} ${storeFilter({ ...filters, activeOnly: false })}) as total_competitors,
      (select count(*)::int from stores st where st.org_id = ${orgId} and st.status = 'active' ${storeFilter({ ...filters, activeOnly: false })}) as active_competitors,
      (select count(*)::int from scoped_products) as total_products,
      (select count(*)::int from scoped_products where last_snapshot_availability = 'in_stock') as products_in_stock,
      (select count(*)::int from scoped_products where last_snapshot_availability = 'out_of_stock') as products_out_of_stock,
      (select count(*)::int from priced where ${rangeFilter(sql`priced.scraped_at`, filters)} and price is not null and previous_price is not null and price <> previous_price) as price_changes,
      (select count(*)::int from priced where ${rangeFilter(sql`priced.scraped_at`, filters)} and price is not null and previous_price is not null and price < previous_price) as price_drops,
      (select count(*)::int from priced where ${rangeFilter(sql`priced.scraped_at`, filters)} and price is not null and previous_price is not null and price > previous_price) as price_increases,
      (select count(*)::int from alert_rules ar where ar.org_id = ${orgId} and ar.active = true) as active_alerts,
      (select count(*)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and ${rangeFilter(sql`sr.created_at`, filters)} and sr.status = 'failed') as failed_runs,
      (select max(sr.finished_at)::text from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.status in ('success', 'partial')) as last_successful_crawl,
      (select count(*)::int from scoped_products where last_scraped_at >= now() - interval '24 hours') as fresh_products
  `);

  const [previous] = await db().execute<PreviousRow>(sql`
    with scoped_stores as (
      select st.*
      from stores st
      where st.org_id = ${orgId}
      ${storeFilter(filters)}
    ),
    scoped_products as (
      select cp.*
      from competitor_products cp
      join scoped_stores st on st.id = cp.store_id
      where cp.org_id = ${orgId}
    ),
    priced as (
      select ps.*,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price
      from price_snapshots ps
      join scoped_products cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}::timestamptz
    )
    select
      (select count(*)::int from priced where priced.scraped_at >= ${filters.previousDateFrom}::timestamptz and priced.scraped_at < ${filters.previousDateTo}::timestamptz and price is not null and previous_price is not null and price <> previous_price) as price_changes,
      (select count(*)::int from priced where priced.scraped_at >= ${filters.previousDateFrom}::timestamptz and priced.scraped_at < ${filters.previousDateTo}::timestamptz and price is not null and previous_price is not null and price < previous_price) as price_drops,
      (select count(*)::int from priced where priced.scraped_at >= ${filters.previousDateFrom}::timestamptz and priced.scraped_at < ${filters.previousDateTo}::timestamptz and price is not null and previous_price is not null and price > previous_price) as price_increases,
      (select count(*)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.created_at >= ${filters.previousDateFrom}::timestamptz and sr.created_at < ${filters.previousDateTo}::timestamptz and sr.status = 'failed') as failed_runs
  `);

  const data = row ?? emptyOverview();
  const previousData = previous ?? { price_changes: 0, price_drops: 0, price_increases: 0, failed_runs: 0 };
  const freshness = calculateFreshness(data.total_products, data.fresh_products);
  return [
    kpi('Total competitors', data.total_competitors, undefined, 'neutral', '/competitors'),
    kpi('Active competitors', data.active_competitors, undefined, data.active_competitors ? 'good' : 'warning', '/competitors?status=active'),
    kpi('Total monitored products', data.total_products, undefined, 'neutral', '/products'),
    kpi('Products in stock', data.products_in_stock, undefined, 'good', '/products?availability=in_stock'),
    kpi('Products out of stock', data.products_out_of_stock, undefined, data.products_out_of_stock ? 'warning' : 'good', '/products?availability=out_of_stock'),
    kpi('Price changes today', data.price_changes, calculatePctDelta(data.price_changes, previousData.price_changes), 'neutral'),
    kpi('Price drops today', data.price_drops, calculatePctDelta(data.price_drops, previousData.price_drops), data.price_drops ? 'warning' : 'good'),
    kpi('Price increases today', data.price_increases, calculatePctDelta(data.price_increases, previousData.price_increases), 'neutral'),
    kpi('Active alerts', data.active_alerts, undefined, data.active_alerts ? 'warning' : 'neutral', '/alerts'),
    kpi('Failed scraping jobs', data.failed_runs, calculatePctDelta(data.failed_runs, previousData.failed_runs), data.failed_runs ? 'critical' : 'good', '/jobs?status=failed'),
    {
      label: 'Last successful crawl',
      value: data.last_successful_crawl ? new Date(data.last_successful_crawl).toLocaleString() : 'never',
      numericValue: data.last_successful_crawl ? Date.parse(data.last_successful_crawl) : 0,
      status: data.last_successful_crawl ? 'good' : 'warning',
      href: '/jobs',
    },
    kpi('Data freshness score', freshness, undefined, freshness >= 80 ? 'good' : freshness >= 50 ? 'warning' : 'critical'),
  ];
}

function kpi(label: string, value: number, delta?: number, status: DashboardKpi['status'] = 'neutral', href?: string): DashboardKpi {
  return { label, value: value.toLocaleString(), numericValue: value, delta, status, href };
}

function emptyOverview(): OverviewRow {
  return {
    total_competitors: 0,
    active_competitors: 0,
    total_products: 0,
    products_in_stock: 0,
    products_out_of_stock: 0,
    price_changes: 0,
    price_drops: 0,
    price_increases: 0,
    active_alerts: 0,
    failed_runs: 0,
    last_successful_crawl: null,
    fresh_products: 0,
  };
}
