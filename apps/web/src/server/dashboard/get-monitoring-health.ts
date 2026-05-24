import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildHealth } from './helpers';
import { storeFilter } from './sql';
import type { DashboardFilters, MonitoringHealth } from './types';

interface Row extends Record<string, unknown> {
  total_runs: number;
  successful_runs: number;
  failed_runs_24h: number;
  avg_duration_ms: number | null;
  broken_selectors: number;
  manual_sessions: number;
  stale_products: number;
  last_worker_heartbeat: string | null;
}

export async function getMonitoringHealth(orgId: string, filters: DashboardFilters): Promise<MonitoringHealth> {
  const [row] = await db().execute<Row>(sql`
    with scoped_stores as (
      select st.*
      from stores st
      where st.org_id = ${orgId}
      ${storeFilter(filters)}
    )
    select
      (select count(*)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.created_at >= ${filters.dateFrom}) as total_runs,
      (select count(*)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.created_at >= ${filters.dateFrom} and sr.status in ('success','partial')) as successful_runs,
      (select count(*)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.created_at >= now() - interval '24 hours' and sr.status = 'failed') as failed_runs_24h,
      (select avg(extract(epoch from (sr.finished_at - sr.started_at)) * 1000)::int from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId} and sr.started_at is not null and sr.finished_at is not null and sr.created_at >= ${filters.dateFrom}) as avg_duration_ms,
      (select count(*)::int from competitor_products cp join scoped_stores st on st.id = cp.store_id where cp.org_id = ${orgId} and cp.selector_failure_count > 0) as broken_selectors,
      (select count(*)::int from manual_scraping_sessions ms left join scoped_stores st on st.id = ms.competitor_id where ms.organization_id = ${orgId} and ms.status not in ('completed','cancelled','expired')) as manual_sessions,
      (select count(*)::int from competitor_products cp join scoped_stores st on st.id = cp.store_id where cp.org_id = ${orgId} and cp.active = true and (cp.last_scraped_at is null or cp.last_scraped_at < now() - interval '24 hours')) as stale_products,
      greatest(
        (select max(sr.created_at) from scrape_runs sr join scoped_stores st on st.id = sr.store_id where sr.org_id = ${orgId}),
        (select max(dr.started_at) from site_discovery_runs dr join scoped_stores st on st.id = dr.competitor_id where dr.organization_id = ${orgId})
      )::text as last_worker_heartbeat
  `);

  const data = row ?? {
    total_runs: 0,
    successful_runs: 0,
    failed_runs_24h: 0,
    avg_duration_ms: 0,
    broken_selectors: 0,
    manual_sessions: 0,
    stale_products: 0,
    last_worker_heartbeat: null,
  };
  const successRate = data.total_runs > 0 ? Math.round((data.successful_runs / data.total_runs) * 100) : 100;
  return buildHealth({
    scrapingSuccessRate: successRate,
    failedRuns24h: data.failed_runs_24h,
    averageCrawlDurationMs: data.avg_duration_ms ?? 0,
    brokenSelectorsCount: data.broken_selectors,
    manualSessionsCount: data.manual_sessions,
    staleProductsCount: data.stale_products,
    lastWorkerHeartbeat: data.last_worker_heartbeat,
  });
}
