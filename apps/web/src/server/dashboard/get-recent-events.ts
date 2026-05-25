import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { productFilter, storeFilter } from './sql';
import type { DashboardFilters, RecentEvent } from './types';

interface Row extends Record<string, unknown> {
  id: string;
  type: RecentEvent['type'];
  entity: string;
  timestamp: string;
  status: RecentEvent['status'];
  href: string | null;
}

export async function getRecentEvents(orgId: string, filters: DashboardFilters): Promise<RecentEvent[]> {
  const rows = await db().execute<Row>(sql`
    with scoped_stores as (
      select st.*
      from stores st
      where st.org_id = ${orgId}
      ${storeFilter(filters)}
    ),
    scoped_products as (
      select cp.*, st.name as competitor_name
      from competitor_products cp
      join stores st on st.id = cp.store_id
      where cp.org_id = ${orgId}
        ${productFilter(filters)}
    ),
    priced as (
      select ps.*,
             cp.title as product_title,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price
      from price_snapshots ps
      join scoped_products cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}::timestamptz
    )
    select *
    from (
      select ('price-' || ps.id::text) as id,
             'price_changed' as type,
             coalesce(ps.product_title, 'Product') as entity,
             ps.scraped_at::text as timestamp,
             'neutral' as status,
             '/competitors/products/' || ps.competitor_product_id::text as href
      from priced ps
      where ps.scraped_at >= ${filters.dateFrom}::timestamptz
        and ps.price is not null
        and ps.previous_price is not null
        and ps.price <> ps.previous_price

      union all

      select ('discover-product-' || sp.id::text) as id,
             'product_discovered' as type,
             coalesce(sp.title, sp.url) as entity,
             sp.created_at::text as timestamp,
             'success' as status,
             '/competitors/' || sp.competitor_id::text || '/discovery/' || sp.run_id::text || '/report' as href
      from site_discovery_products sp
      join scoped_stores st on st.id = sp.competitor_id
      where sp.created_at >= ${filters.dateFrom}::timestamptz

      union all

      select ('crawl-' || dr.id::text) as id,
             'competitor_crawl_completed' as type,
             st.name as entity,
             coalesce(dr.finished_at, dr.started_at)::text as timestamp,
             case when dr.status in ('success','partial') then 'success' else 'warning' end as status,
             '/competitors/' || dr.competitor_id::text || '/discovery/' || dr.id::text as href
      from site_discovery_runs dr
      join scoped_stores st on st.id = dr.competitor_id
      where coalesce(dr.finished_at, dr.started_at) >= ${filters.dateFrom}::timestamptz

      union all

      select ('alert-' || n.id::text) as id,
             'alert_triggered' as type,
             n.title as entity,
             n.created_at::text as timestamp,
             'warning' as status,
             '/alerts' as href
      from notifications n
      where n.org_id = ${orgId}
        and n.created_at >= ${filters.dateFrom}::timestamptz

      union all

      select ('captcha-' || ms.id::text) as id,
             'captcha_required' as type,
             ms.url as entity,
             ms.created_at::text as timestamp,
             'critical' as status,
             case when ms.competitor_id is null then '/jobs' else '/competitors/' || ms.competitor_id::text || '/rules' end as href
      from manual_scraping_sessions ms
      left join scoped_stores st on st.id = ms.competitor_id
      where ms.organization_id = ${orgId}
        and ms.created_at >= ${filters.dateFrom}::timestamptz

      union all

      select ('scrape-failed-' || sr.id::text) as id,
             'scrape_failed' as type,
             coalesce(st.name, 'Scrape run') as entity,
             sr.created_at::text as timestamp,
             'critical' as status,
             '/jobs' as href
      from scrape_runs sr
      left join scoped_stores st on st.id = sr.store_id
      where sr.org_id = ${orgId}
        and sr.created_at >= ${filters.dateFrom}::timestamptz
        and sr.status = 'failed'

      union all

      select ('export-' || e.id::text) as id,
             'export_completed' as type,
             e.kind::text as entity,
             e.created_at::text as timestamp,
             case when e.status = 'ready' then 'success' when e.status = 'failed' then 'critical' else 'neutral' end as status,
             '/exports' as href
      from exports e
      where e.org_id = ${orgId}
        and e.created_at >= ${filters.dateFrom}::timestamptz
    ) events
    order by timestamp desc
    limit 50
  `);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    entity: row.entity,
    timestamp: row.timestamp,
    status: row.status,
    href: row.href ?? undefined,
  }));
}
