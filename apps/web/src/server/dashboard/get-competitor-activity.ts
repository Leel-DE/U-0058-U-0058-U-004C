import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeFilter } from './sql';
import type { CompetitorActivityRow, DashboardFilters } from './types';

interface Row extends Record<string, unknown> {
  competitor_id: string;
  competitor_name: string;
  products_monitored: number;
  changes_today: number;
  average_discount_pct: string | null;
  stock_changes: number;
  failed_runs: number;
  last_crawl: string | null;
  status: string;
}

export async function getCompetitorActivity(orgId: string, filters: DashboardFilters): Promise<CompetitorActivityRow[]> {
  const rows = await db().execute<Row>(sql`
    with scoped_stores as (
      select st.*
      from stores st
      where st.org_id = ${orgId}
      ${storeFilter(filters)}
    ),
    movements as (
      select x.store_id,
             count(*) filter (where x.price is not null and x.previous_price is not null and x.price <> x.previous_price)::int as changes,
             avg(((x.old_price - x.price) / nullif(x.old_price, 0)) * 100) filter (where x.old_price is not null and x.price is not null and x.old_price > x.price) as avg_discount,
             count(*) filter (where x.availability is not null and x.previous_availability is not null and x.availability <> x.previous_availability)::int as stock_changes
      from (
        select cp.store_id,
               ps.price,
               ps.old_price,
               ps.availability,
               lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price,
               lag(ps.availability) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_availability,
               ps.scraped_at
        from price_snapshots ps
        join competitor_products cp on cp.id = ps.competitor_product_id
        join scoped_stores st on st.id = cp.store_id
        where ps.org_id = ${orgId}
          and ps.scraped_at >= ${filters.previousDateFrom}::timestamptz
      ) x
      where x.scraped_at >= ${filters.dateFrom}::timestamptz
      group by x.store_id
    ),
    failures as (
      select sr.store_id, count(*)::int as failed_runs
      from scrape_runs sr
      join scoped_stores st on st.id = sr.store_id
      where sr.org_id = ${orgId}
        and sr.created_at >= ${filters.dateFrom}::timestamptz
        and sr.status = 'failed'
      group by sr.store_id
    )
    select st.id as competitor_id,
           st.name as competitor_name,
           count(cp.id)::int as products_monitored,
           coalesce(m.changes, 0)::int as changes_today,
           coalesce(m.avg_discount, 0)::numeric(12,2)::text as average_discount_pct,
           coalesce(m.stock_changes, 0)::int as stock_changes,
           coalesce(f.failed_runs, 0)::int as failed_runs,
           greatest(st.last_successful_scrape_at, max(sr.finished_at))::text as last_crawl,
           st.status::text as status
    from scoped_stores st
    left join competitor_products cp on cp.store_id = st.id and cp.org_id = ${orgId}
    left join movements m on m.store_id = st.id
    left join failures f on f.store_id = st.id
    left join scrape_runs sr on sr.store_id = st.id and sr.org_id = ${orgId} and sr.status in ('success','partial')
    group by st.id, st.name, st.status, st.last_successful_scrape_at, m.changes, m.avg_discount, m.stock_changes, f.failed_runs
    ${filters.failedOnly ? sql`having coalesce(f.failed_runs, 0) > 0` : sql``}
    order by changes_today desc, products_monitored desc
    limit 20
  `);

  return rows.map((row) => ({
    competitorId: row.competitor_id,
    competitorName: row.competitor_name,
    productsMonitored: row.products_monitored,
    changesToday: row.changes_today,
    averageDiscountPct: Number(row.average_discount_pct ?? 0),
    stockChanges: row.stock_changes,
    failedRuns: row.failed_runs,
    lastCrawl: row.last_crawl,
    status: row.status,
  }));
}
