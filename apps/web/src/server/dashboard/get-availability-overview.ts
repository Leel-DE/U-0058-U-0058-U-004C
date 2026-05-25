import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { productFilter } from './sql';
import type { AvailabilityOverview, DashboardFilters } from './types';

interface Row extends Record<string, unknown> {
  in_stock: number;
  out_of_stock: number;
  unknown_count: number;
  back_in_stock: number;
  newly_unavailable: number;
}

export async function getAvailabilityOverview(orgId: string, filters: DashboardFilters): Promise<AvailabilityOverview> {
  const [row] = await db().execute<Row>(sql`
    with scoped_products as (
      select cp.*
      from competitor_products cp
      join stores st on st.id = cp.store_id
      where cp.org_id = ${orgId}
        ${productFilter(filters)}
    ),
    stock_changes as (
      select availability,
             lag(availability) over (partition by competitor_product_id order by scraped_at) as previous_availability,
             scraped_at
      from price_snapshots ps
      join scoped_products cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}::timestamptz
    )
    select
      (select count(*)::int from scoped_products where last_snapshot_availability = 'in_stock') as in_stock,
      (select count(*)::int from scoped_products where last_snapshot_availability = 'out_of_stock') as out_of_stock,
      (select count(*)::int from scoped_products where last_snapshot_availability is null or last_snapshot_availability = 'unknown') as unknown_count,
      (select count(*)::int from stock_changes where scraped_at >= ${filters.dateFrom}::timestamptz and previous_availability = 'out_of_stock' and availability = 'in_stock') as back_in_stock,
      (select count(*)::int from stock_changes where scraped_at >= ${filters.dateFrom}::timestamptz and previous_availability <> 'out_of_stock' and availability = 'out_of_stock') as newly_unavailable
  `);
  const data = row ?? { in_stock: 0, out_of_stock: 0, unknown_count: 0, back_in_stock: 0, newly_unavailable: 0 };
  return {
    inStock: data.in_stock,
    outOfStock: data.out_of_stock,
    unknown: data.unknown_count,
    backInStockToday: data.back_in_stock,
    newlyUnavailableToday: data.newly_unavailable,
    distribution: [
      { name: 'In stock', value: data.in_stock },
      { name: 'Out of stock', value: data.out_of_stock },
      { name: 'Unknown', value: data.unknown_count },
    ],
  };
}
