import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsLatestProductsCte, analyticsScopeCte } from './analytics-filters';
import type { AnalyticsFilters, ProductMovementRow, ProductMovements } from './types';

interface MovementRow extends Record<string, unknown> {
  product_id: string | null;
  competitor_product_id: string;
  product_title: string;
  competitor_name: string;
  old_price: string | null;
  new_price: string | null;
  currency: string | null;
  delta_amount: string | null;
  delta_pct: string | null;
  timestamp: string | null;
  metric: string | null;
}

export async function getProductMovements(orgId: string, filters: AnalyticsFilters): Promise<ProductMovements> {
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const latest = analyticsLatestProductsCte('latest_products', orgId, filters);
  const rows = await db().execute<MovementRow>(sql`
    with ${scoped}, ${latest},
    sequenced as (
      select
        scoped.*,
        lag(price) over (partition by competitor_product_id order by scraped_at) as previous_price
      from scoped
    ),
    changes as (
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, cp_title, cp_url) as product_title,
        competitor_name,
        previous_price as old_price,
        price as new_price,
        currency,
        price - previous_price as delta_amount,
        case when previous_price > 0 then ((price - previous_price) / previous_price) * 100 end as delta_pct,
        scraped_at as timestamp,
        abs(case when previous_price > 0 then ((price - previous_price) / previous_price) * 100 end) as metric
      from sequenced
      where previous_price is not null and price is not null and price <> previous_price
    ),
    volatile as (
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, cp_title, cp_url) as product_title,
        competitor_name,
        min(price) as old_price,
        max(price) as new_price,
        currency,
        max(price) - min(price) as delta_amount,
        case when avg(price) > 0 then ((max(price) - min(price)) / avg(price)) * 100 end as delta_pct,
        max(scraped_at) as timestamp,
        count(*) filter (where price is not null)::numeric as metric
      from scoped
      where price is not null
      group by product_id, competitor_product_id, coalesce(product_name, cp_title, cp_url), competitor_name, currency
    ),
    discounted as (
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, title, url) as product_title,
        competitor_name,
        old_price,
        price as new_price,
        currency,
        old_price - price as delta_amount,
        case when old_price > 0 then ((old_price - price) / old_price) * 100 end as delta_pct,
        scraped_at as timestamp,
        case when old_price > 0 then ((old_price - price) / old_price) * 100 end as metric
      from latest_products
      where old_price is not null and price is not null and old_price > price
    ),
    missing_price as (
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, title, url) as product_title,
        competitor_name,
        null::numeric as old_price,
        price as new_price,
        currency,
        null::numeric as delta_amount,
        null::numeric as delta_pct,
        scraped_at as timestamp,
        null::numeric as metric
      from latest_products
      where price is null
    ),
    stale as (
      select
        product_id,
        competitor_product_id,
        coalesce(product_name, title, url) as product_title,
        competitor_name,
        null::numeric as old_price,
        price as new_price,
        currency,
        null::numeric as delta_amount,
        null::numeric as delta_pct,
        last_scraped_at as timestamp,
        extract(epoch from (now() - last_scraped_at)) / 3600 as metric
      from latest_products
      where last_scraped_at is null or last_scraped_at < now() - interval '24 hours'
    )
    select 'drop' as kind, * from changes where delta_amount < 0
    union all select 'increase' as kind, * from changes where delta_amount > 0
    union all select 'volatile' as kind, * from volatile where coalesce(delta_pct, 0) > 0
    union all select 'discounted' as kind, * from discounted
    union all select 'frequent' as kind, * from volatile where metric > 1
    union all select 'missing' as kind, * from missing_price
    union all select 'stale' as kind, * from stale
  `);

  const byKind = (kind: string, limit = 20) => rows
    .filter((row) => (row as unknown as { kind: string }).kind === kind)
    .map(mapMovement)
    .sort((a, b) => Math.abs(b.metric ?? b.deltaPct ?? 0) - Math.abs(a.metric ?? a.deltaPct ?? 0))
    .slice(0, limit);

  return {
    biggestDrops: byKind('drop'),
    biggestIncreases: byKind('increase'),
    mostVolatile: byKind('volatile'),
    mostDiscounted: byKind('discounted'),
    mostFrequentlyChanging: byKind('frequent'),
    missingPrices: byKind('missing'),
    staleProducts: byKind('stale'),
  };
}

function mapMovement(row: MovementRow): ProductMovementRow {
  const competitorProductId = row.competitor_product_id;
  const productId = row.product_id ?? competitorProductId;
  return {
    productId,
    competitorProductId,
    productTitle: row.product_title,
    competitorName: row.competitor_name,
    oldPrice: numberOrNull(row.old_price),
    newPrice: numberOrNull(row.new_price),
    currency: row.currency ?? 'EUR',
    deltaAmount: numberOrNull(row.delta_amount),
    deltaPct: numberOrNull(row.delta_pct),
    timestamp: row.timestamp,
    metric: numberOrNull(row.metric) ?? undefined,
    href: row.product_id ? `/products/${row.product_id}` : `/competitors/products/${competitorProductId}`,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
