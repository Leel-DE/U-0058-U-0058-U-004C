import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface AnalyticsFilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface AnalyticsFilterOptions {
  competitors: AnalyticsFilterOption[];
  categories: AnalyticsFilterOption[];
  brands: AnalyticsFilterOption[];
}

export async function getAnalyticsFilterOptions(orgId: string): Promise<AnalyticsFilterOptions> {
  const [competitors, categories, brands] = await Promise.all([
    db().execute<AnalyticsOptionRow>(sql`
      select st.id::text as value, st.name as label, count(cp.id)::int as count
      from stores st
      left join competitor_products cp on cp.store_id = st.id
      where st.org_id = ${orgId}
      group by st.id, st.name
      order by st.name asc
    `),
    db().execute<AnalyticsOptionRow>(sql`
      select c.id::text as value, c.name as label, count(mp.id)::int as count
      from categories c
      left join my_products mp on mp.category_id = c.id
      where c.org_id = ${orgId}
      group by c.id, c.name
      order by c.name asc
    `),
    db().execute<AnalyticsOptionRow>(sql`
      select coalesce(brand, 'Unknown') as value, coalesce(brand, 'Unknown') as label, count(*)::int as count
      from (
        select brand from my_products where org_id = ${orgId}
        union all
        select brand from competitor_products where org_id = ${orgId}
      ) brands
      group by coalesce(brand, 'Unknown')
      order by count desc, label asc
      limit 80
    `),
  ]);
  return {
    competitors: competitors.map(mapOption),
    categories: categories.map(mapOption),
    brands: brands.map(mapOption),
  };
}

interface AnalyticsOptionRow extends Record<string, unknown> {
  value: string | null;
  label: string | null;
  count: number;
}

function mapOption(row: AnalyticsOptionRow): AnalyticsFilterOption {
  return { value: row.value ?? 'Unknown', label: row.label ?? 'Unknown', count: Number(row.count ?? 0) };
}
