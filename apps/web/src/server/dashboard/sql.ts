import { sql, type SQL } from 'drizzle-orm';
import type { DashboardFilters } from './types';

export function storeFilter(filters: DashboardFilters): SQL {
  return sql`
    and (${filters.competitorId ?? null}::uuid is null or st.id = ${filters.competitorId ?? null}::uuid)
    and (${filters.activeOnly} = false or st.status = 'active')
    and (
      ${filters.categoryId ?? null}::uuid is null
      or exists (
        select 1
        from competitor_products cp_filter
        join product_matches pm_filter on pm_filter.competitor_product_id = cp_filter.id
        join my_products mp_filter on mp_filter.id = pm_filter.my_product_id
        where cp_filter.store_id = st.id
          and cp_filter.org_id = st.org_id
          and mp_filter.category_id = ${filters.categoryId ?? null}::uuid
      )
    )
  `;
}

export function productFilter(filters: DashboardFilters): SQL {
  return sql`
    and (${filters.competitorId ?? null}::uuid is null or cp.store_id = ${filters.competitorId ?? null}::uuid)
    and (${filters.activeOnly} = false or st.status = 'active')
    and (
      ${filters.categoryId ?? null}::uuid is null
      or exists (
        select 1
        from product_matches pm_filter
        join my_products mp_filter on mp_filter.id = pm_filter.my_product_id
        where pm_filter.competitor_product_id = cp.id
          and pm_filter.org_id = cp.org_id
          and mp_filter.category_id = ${filters.categoryId ?? null}::uuid
      )
    )
  `;
}

export function rangeFilter(column: SQL, filters: DashboardFilters): SQL {
  return sql`${column} >= ${filters.dateFrom}::timestamptz`;
}

export function previousRangeFilter(column: SQL, filters: DashboardFilters): SQL {
  return sql`${column} >= ${filters.previousDateFrom}::timestamptz and ${column} < ${filters.previousDateTo}::timestamptz`;
}

export function bucketExpression(filters: DashboardFilters): SQL {
  return filters.range === 'today' ? sql`date_trunc('hour', ps.scraped_at)` : sql`date_trunc('day', ps.scraped_at)`;
}
