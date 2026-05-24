import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { productFilter } from './sql';
import type { AttentionIssueType, AttentionProduct, DashboardFilters } from './types';

interface Row extends Record<string, unknown> {
  product_id: string;
  product_title: string | null;
  competitor_id: string;
  competitor_name: string;
  issue_type: AttentionIssueType;
  current_price: string | null;
  previous_price: string | null;
  currency: string | null;
  availability: string | null;
  confidence: string | null;
  last_checked: string | null;
}

export async function getProductsRequiringAttention(orgId: string, filters: DashboardFilters): Promise<AttentionProduct[]> {
  const rows = await db().execute<Row>(sql`
    with scoped_products as (
      select cp.*, st.name as competitor_name
      from competitor_products cp
      join stores st on st.id = cp.store_id
      where cp.org_id = ${orgId}
        and cp.active = true
        ${productFilter(filters)}
    ),
    latest as (
      select distinct on (ps.competitor_product_id)
             ps.competitor_product_id,
             ps.price,
             lag(ps.price) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_price,
             ps.currency,
             ps.availability,
             lag(ps.availability) over (partition by ps.competitor_product_id order by ps.scraped_at) as previous_availability,
             ps.confidence,
             ps.status,
             ps.scraped_at
      from price_snapshots ps
      join scoped_products cp on cp.id = ps.competitor_product_id
      where ps.org_id = ${orgId}
      order by ps.competitor_product_id, ps.scraped_at desc
    ),
    duplicate_urls as (
      select url_hash
      from scoped_products
      group by url_hash
      having count(*) > 1
    ),
    candidates as (
      select cp.id as product_id,
             cp.title as product_title,
             cp.store_id as competitor_id,
             cp.competitor_name,
             case
               when cp.selector_failure_count > 0 then 'selector_broken'
               when l.status = 'captcha' then 'captcha_required'
               when l.status is not null and l.status <> 'ok' then 'extraction_failed'
               when cp.url_hash in (select url_hash from duplicate_urls) then 'duplicate_product'
               when l.price is null and cp.last_snapshot_price is null then 'missing_price'
               when cp.last_scraped_at is null or cp.last_scraped_at < now() - interval '24 hours' then 'stale_data'
               when l.previous_availability = 'out_of_stock' and l.availability = 'in_stock' then 'back_in_stock'
               when l.previous_availability is distinct from 'out_of_stock' and l.availability = 'out_of_stock' then 'out_of_stock'
               when l.price is not null and l.previous_price is not null and l.previous_price > 0 and ((l.price - l.previous_price) / l.previous_price) * 100 <= -5 then 'price_drop'
               when l.price is not null and l.previous_price is not null and l.previous_price > 0 and ((l.price - l.previous_price) / l.previous_price) * 100 >= 5 then 'price_increase'
               else null
             end as issue_type,
             coalesce(l.price, cp.last_snapshot_price)::text as current_price,
             l.previous_price::text as previous_price,
             coalesce(l.currency, cp.last_snapshot_currency, 'EUR') as currency,
             coalesce(l.availability::text, cp.last_snapshot_availability) as availability,
             l.confidence::text as confidence,
             coalesce(l.scraped_at, cp.last_scraped_at)::text as last_checked
      from scoped_products cp
      left join latest l on l.competitor_product_id = cp.id
    )
    select *
    from candidates
    where issue_type is not null
    order by
      case issue_type
        when 'captcha_required' then 1
        when 'selector_broken' then 2
        when 'extraction_failed' then 3
        when 'missing_price' then 4
        when 'stale_data' then 5
        else 10
      end,
      last_checked asc nulls first
    limit 50
  `);

  return rows.map((row) => ({
    productId: row.product_id,
    productTitle: row.product_title ?? 'Untitled',
    competitorId: row.competitor_id,
    competitorName: row.competitor_name,
    issueType: row.issue_type,
    currentPrice: row.current_price == null ? null : Number(row.current_price),
    previousPrice: row.previous_price == null ? null : Number(row.previous_price),
    currency: row.currency ?? 'EUR',
    availability: row.availability,
    confidence: row.confidence == null ? null : Number(row.confidence),
    lastChecked: row.last_checked,
    href: `/competitors/products/${row.product_id}`,
  }));
}
