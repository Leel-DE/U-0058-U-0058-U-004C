import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface DashboardFilterCompetitor {
  id: string;
  name: string;
}

export interface DashboardFilterCategory {
  id: string;
  name: string;
}

export async function getDashboardFilterOptions(
  orgId: string,
): Promise<{ competitors: DashboardFilterCompetitor[]; categories: DashboardFilterCategory[] }> {
  const [competitors, categories] = await Promise.all([
    db().execute<DashboardFilterCompetitor & Record<string, unknown>>(sql`
    select id, name
    from stores
    where org_id = ${orgId}
    order by name asc
  `),
    db().execute<DashboardFilterCategory & Record<string, unknown>>(sql`
      select id, name
      from categories
      where org_id = ${orgId}
      order by name asc
    `),
  ]);
  return { competitors, categories };
}
