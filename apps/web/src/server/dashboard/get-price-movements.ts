import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bucketExpression, productFilter } from './sql';
import type { DashboardFilters, PriceMovementPoint, PriceMovementRow, PriceMovements } from './types';

interface TimelineRow extends Record<string, unknown> {
  bucket: string;
  drops: number;
  increases: number;
}

interface MovementDbRow extends Record<string, unknown> {
  product_id: string;
  product_title: string | null;
  competitor_id: string;
  competitor_name: string;
  old_price: string;
  new_price: string;
  currency: string | null;
  delta_amount: string;
  delta_pct: string;
  captured_at: string;
}

export async function getPriceMovements(orgId: string, filters: DashboardFilters): Promise<PriceMovements> {
  const bucket = bucketExpression(filters);
  const timeline = await db().execute<TimelineRow>(sql`
    with priced as (
      select ps.*,
             cp.title as product_title,
             cp.store_id,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price
      from price_snapshots ps
      join competitor_products cp on cp.id = ps.competitor_product_id
      join stores st on st.id = cp.store_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}
        ${productFilter(filters)}
    )
    select ${bucket}::text as bucket,
           count(*) filter (where price < previous_price)::int as drops,
           count(*) filter (where price > previous_price)::int as increases
    from priced ps
    where ps.scraped_at >= ${filters.dateFrom}
      and ps.price is not null
      and ps.previous_price is not null
      and ps.price <> ps.previous_price
    group by 1
    order by 1 asc
  `);

  const rows = await db().execute<MovementDbRow>(sql`
    with priced as (
      select ps.*,
             cp.title as product_title,
             cp.store_id,
             st.name as competitor_name,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price
      from price_snapshots ps
      join competitor_products cp on cp.id = ps.competitor_product_id
      join stores st on st.id = cp.store_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${filters.previousDateFrom}
        ${productFilter(filters)}
    )
    select competitor_product_id as product_id,
           coalesce(product_title, title, 'Untitled') as product_title,
           store_id as competitor_id,
           competitor_name,
           previous_price::text as old_price,
           price::text as new_price,
           coalesce(currency, 'EUR') as currency,
           (price - previous_price)::text as delta_amount,
           (((price - previous_price) / nullif(previous_price, 0)) * 100)::numeric(12,2)::text as delta_pct,
           scraped_at::text as captured_at
    from priced
    where scraped_at >= ${filters.dateFrom}
      and price is not null
      and previous_price is not null
      and price <> previous_price
    order by abs(((price - previous_price) / nullif(previous_price, 0)) * 100) desc nulls last
    limit 100
  `);

  const mapped = rows.map(mapMovement);
  return {
    timeline: timeline.map((r): PriceMovementPoint => ({
      bucket: r.bucket,
      drops: Number(r.drops),
      increases: Number(r.increases),
    })),
    drops: mapped.filter((r) => r.deltaAmount < 0).sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 10),
    increases: mapped.filter((r) => r.deltaAmount > 0).sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 10),
  };
}

function mapMovement(r: MovementDbRow): PriceMovementRow {
  return {
    productId: r.product_id,
    productTitle: r.product_title ?? 'Untitled',
    competitorId: r.competitor_id,
    competitorName: r.competitor_name,
    oldPrice: Number(r.old_price),
    newPrice: Number(r.new_price),
    currency: r.currency ?? 'EUR',
    deltaAmount: Number(r.delta_amount),
    deltaPct: Number(r.delta_pct),
    capturedAt: r.captured_at,
  };
}
