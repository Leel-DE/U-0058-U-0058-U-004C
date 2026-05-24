import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/db';

interface Row extends Record<string, unknown> {
  monitored_products: number;
  active_stores: number;
  active_alerts: number;
  unread_notifications: number;
  snapshots_24h: number;
  snapshots_7d: number;
}

const getDashboardKpis = unstable_cache(
  async (orgId: string) => {
    const result = await db().execute<Row>(sql`
      select monitored_products, active_stores, active_alerts,
             unread_notifications, snapshots_24h, snapshots_7d
      from v_org_dashboard
      where org_id = ${orgId}
      limit 1
    `);
    return (
      result[0] ?? {
        monitored_products: 0,
        active_stores: 0,
        active_alerts: 0,
        unread_notifications: 0,
        snapshots_24h: 0,
        snapshots_7d: 0,
      }
    );
  },
  ['dashboard-kpis'],
  { revalidate: 15 },
);

export async function DashboardKpis({ orgId }: { orgId: string }) {
  const row = await getDashboardKpis(orgId);
  const cards = [
    { label: 'Monitored products', value: row.monitored_products },
    { label: 'Active stores', value: row.active_stores },
    { label: 'Active alerts', value: row.active_alerts },
    { label: 'Snapshots - 24h', value: row.snapshots_24h },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{Number(c.value)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
