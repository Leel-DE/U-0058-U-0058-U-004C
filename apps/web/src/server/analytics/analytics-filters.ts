import { sql, type SQL } from 'drizzle-orm';
import type { AnalyticsFilters, AnalyticsRange } from './types';

const DAY_MS = 86_400_000;
const RANGES: Record<Exclude<AnalyticsRange, 'all'>, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
  '1y': 365 * DAY_MS,
};

export function parseAnalyticsFilters(input: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const range = normalizeRange(one(input.range));
  const now = new Date();
  const windowMs = range === 'all' ? null : RANGES[range];
  const dateFrom = windowMs == null ? null : new Date(now.getTime() - windowMs);
  return {
    range,
    dateFrom,
    previousDateFrom: windowMs == null || dateFrom == null ? null : new Date(dateFrom.getTime() - windowMs),
    previousDateTo: dateFrom,
    competitor: clean(one(input.competitor)),
    category: clean(one(input.category)),
    brand: clean(one(input.brand)),
    availability: clean(one(input.availability)),
    discountOnly: one(input.discountOnly) === 'true',
    inStockOnly: one(input.inStockOnly) === 'true',
    staleOnly: one(input.staleOnly) === 'true',
    lowConfidenceOnly: one(input.lowConfidenceOnly) === 'true',
    reviewedOnly: one(input.reviewedOnly) === 'true',
    changesOnly: one(input.changesOnly) === 'true',
    stockChangesOnly: one(input.stockChangesOnly) === 'true',
    minPrice: numberValue(one(input.minPrice)),
    maxPrice: numberValue(one(input.maxPrice)),
    minVolatility: numberValue(one(input.minVolatility)),
    maxVolatility: numberValue(one(input.maxVolatility)),
  };
}

export function analyticsScopeCte(
  cteName: string,
  orgId: string,
  filters: AnalyticsFilters,
  from: Date | null = filters.dateFrom,
  to: Date | null = null,
): SQL {
  const fromValue = from?.toISOString() ?? null;
  const toValue = to?.toISOString() ?? null;
  return sql`
    ${sql.raw(cteName)} as (
      select
        ps.id::text as snapshot_id,
        ps.competitor_product_id::text as competitor_product_id,
        ps.scraped_at,
        ps.price::numeric as price,
        ps.old_price::numeric as old_price,
        coalesce(ps.currency, cp.last_snapshot_currency, 'EUR') as currency,
        ps.availability::text as availability,
        ps.confidence::numeric as confidence,
        ps.status::text as snapshot_status,
        ps.source::text as source,
        ps.image_url,
        ps.title as snapshot_title,
        cp.id::text as cp_id,
        cp.title as cp_title,
        cp.url as cp_url,
        cp.brand as cp_brand,
        cp.last_scraped_at,
        cp.selector_failure_count,
        st.id::text as competitor_id,
        st.name as competitor_name,
        pm.id::text as match_id,
        pm.status::text as match_status,
        mp.id::text as product_id,
        mp.name as product_name,
        mp.brand as product_brand,
        mp.sku as product_sku,
        mp.gtin as product_gtin,
        cat.id::text as category_id,
        cat.name as category_name
      from price_snapshots ps
      join competitor_products cp on cp.id = ps.competitor_product_id
      join stores st on st.id = cp.store_id
      left join product_matches pm on pm.competitor_product_id = cp.id and pm.status = 'confirmed'
      left join my_products mp on mp.id = pm.my_product_id
      left join categories cat on cat.id = mp.category_id
      where ps.org_id = ${orgId}
        and (${fromValue}::timestamptz is null or ps.scraped_at >= ${fromValue}::timestamptz)
        and (${toValue}::timestamptz is null or ps.scraped_at < ${toValue}::timestamptz)
        and (${filters.competitor ?? null}::text is null or st.id::text = ${filters.competitor ?? null} or lower(st.name) = lower(${filters.competitor ?? null}))
        and (${filters.category ?? null}::text is null or cat.id::text = ${filters.category ?? null} or lower(coalesce(cat.name, '')) = lower(${filters.category ?? null}))
        and (${filters.brand ?? null}::text is null or lower(coalesce(mp.brand, cp.brand, 'Unknown')) = lower(${filters.brand ?? null}))
        and (${filters.availability ?? null}::text is null or ps.availability::text = ${filters.availability ?? null})
        and (${filters.discountOnly} = false or (ps.old_price is not null and ps.price is not null and ps.old_price > ps.price))
        and (${filters.inStockOnly} = false or ps.availability = 'in_stock')
        and (${filters.staleOnly} = false or cp.last_scraped_at is null or cp.last_scraped_at < now() - interval '24 hours')
        and (${filters.lowConfidenceOnly} = false or ps.confidence < 0.7)
        and (${filters.reviewedOnly} = false or pm.status = 'confirmed')
        and (${filters.minPrice ?? null}::numeric is null or ps.price >= ${filters.minPrice ?? null}::numeric)
        and (${filters.maxPrice ?? null}::numeric is null or ps.price <= ${filters.maxPrice ?? null}::numeric)
    )
  `;
}

export function analyticsLatestProductsCte(cteName: string, orgId: string, filters: AnalyticsFilters): SQL {
  return sql`
    ${sql.raw(cteName)} as (
      select distinct on (cp.id)
        cp.id::text as competitor_product_id,
        cp.title,
        cp.url,
        cp.brand,
        cp.image_url,
        cp.last_scraped_at,
        cp.selector_failure_count,
        st.id::text as competitor_id,
        st.name as competitor_name,
        pm.id::text as match_id,
        mp.id::text as product_id,
        mp.name as product_name,
        cat.id::text as category_id,
        cat.name as category_name,
        ps.price::numeric as price,
        ps.old_price::numeric as old_price,
        coalesce(ps.currency, cp.last_snapshot_currency, 'EUR') as currency,
        ps.availability::text as availability,
        ps.confidence::numeric as confidence,
        ps.status::text as snapshot_status,
        ps.scraped_at
      from competitor_products cp
      join stores st on st.id = cp.store_id
      left join product_matches pm on pm.competitor_product_id = cp.id and pm.status = 'confirmed'
      left join my_products mp on mp.id = pm.my_product_id
      left join categories cat on cat.id = mp.category_id
      left join price_snapshots ps on ps.competitor_product_id = cp.id
      where cp.org_id = ${orgId}
        and (${filters.competitor ?? null}::text is null or st.id::text = ${filters.competitor ?? null} or lower(st.name) = lower(${filters.competitor ?? null}))
        and (${filters.category ?? null}::text is null or cat.id::text = ${filters.category ?? null} or lower(coalesce(cat.name, '')) = lower(${filters.category ?? null}))
        and (${filters.brand ?? null}::text is null or lower(coalesce(mp.brand, cp.brand, 'Unknown')) = lower(${filters.brand ?? null}))
        and (${filters.availability ?? null}::text is null or ps.availability::text = ${filters.availability ?? null})
        and (${filters.discountOnly} = false or (ps.old_price is not null and ps.price is not null and ps.old_price > ps.price))
        and (${filters.inStockOnly} = false or ps.availability = 'in_stock')
        and (${filters.staleOnly} = false or cp.last_scraped_at is null or cp.last_scraped_at < now() - interval '24 hours')
        and (${filters.lowConfidenceOnly} = false or ps.confidence < 0.7)
        and (${filters.reviewedOnly} = false or pm.status = 'confirmed')
        and (${filters.minPrice ?? null}::numeric is null or ps.price >= ${filters.minPrice ?? null}::numeric)
        and (${filters.maxPrice ?? null}::numeric is null or ps.price <= ${filters.maxPrice ?? null}::numeric)
      order by cp.id, ps.scraped_at desc nulls last
    )
  `;
}

export function bucketExpression(filters: AnalyticsFilters, column = sql`scoped.scraped_at`): SQL {
  if (filters.range === '24h') return sql`date_trunc('hour', ${column})`;
  if (filters.range === 'all' || filters.range === '1y') return sql`date_trunc('month', ${column})`;
  return sql`date_trunc('day', ${column})`;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRange(value: string | undefined): AnalyticsRange {
  if (value === '24h' || value === '7d' || value === '30d' || value === '90d' || value === '1y' || value === 'all') return value;
  return '30d';
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'all' || trimmed === 'none') return undefined;
  return trimmed.slice(0, 140);
}

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}
