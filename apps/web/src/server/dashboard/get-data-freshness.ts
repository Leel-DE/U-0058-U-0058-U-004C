import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { calculateFreshness } from './helpers';
import { productFilter } from './sql';
import type { DashboardFilters, DataFreshness } from './types';

interface Row extends Record<string, unknown> {
  total: number;
  fresh: number;
  stale: number;
  very_stale: number;
  never_checked: number;
}

export async function getDataFreshness(orgId: string, filters: DashboardFilters): Promise<DataFreshness> {
  const [row] = await db().execute<Row>(sql`
    select count(*)::int as total,
           count(*) filter (where cp.last_scraped_at >= now() - interval '24 hours')::int as fresh,
           count(*) filter (where cp.last_scraped_at < now() - interval '24 hours' and cp.last_scraped_at >= now() - interval '7 days')::int as stale,
           count(*) filter (where cp.last_scraped_at < now() - interval '7 days')::int as very_stale,
           count(*) filter (where cp.last_scraped_at is null)::int as never_checked
    from competitor_products cp
    join stores st on st.id = cp.store_id
    where cp.org_id = ${orgId}
      and cp.active = true
      ${productFilter(filters)}
  `);
  const data = row ?? { total: 0, fresh: 0, stale: 0, very_stale: 0, never_checked: 0 };
  return {
    total: data.total,
    fresh: data.fresh,
    stale: data.stale,
    veryStale: data.very_stale,
    neverChecked: data.never_checked,
    freshPct: calculateFreshness(data.total, data.fresh),
  };
}
