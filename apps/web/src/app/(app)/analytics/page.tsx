import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { MarketPositionChart } from './_components/market-position-chart';

export const dynamic = 'force-dynamic';

interface Row extends Record<string, unknown> {
  my_id: string;
  my_name: string;
  my_price: string;
  market_min: string;
  market_avg: string;
  market_max: string;
  competitors: number;
}

export default async function AnalyticsPage() {
  const ctx = await getContext();
  const rows = await db().execute<Row>(sql`
    select mp.id as my_id,
           mp.name as my_name,
           mp.my_price::text,
           min(cp.last_snapshot_price)::text as market_min,
           avg(cp.last_snapshot_price)::numeric(12,2)::text as market_avg,
           max(cp.last_snapshot_price)::text as market_max,
           count(distinct cp.id) as competitors
    from my_products mp
    left join product_matches m
      on m.my_product_id = mp.id and m.status = 'confirmed'
    left join competitor_products cp
      on cp.id = m.competitor_product_id and cp.last_snapshot_price is not null
    where mp.org_id = ${ctx.orgId}
    group by mp.id, mp.name, mp.my_price
    order by competitors desc
    limit 200
  `);

  const enriched = rows.map((r) => {
    const my = r.my_price ? Number(r.my_price) : null;
    const avg = r.market_avg ? Number(r.market_avg) : null;
    const pct = my != null && avg != null && avg > 0 ? ((my - avg) / avg) * 100 : null;
    return {
      ...r,
      myPrice: my,
      avg,
      pctVsAvg: pct,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          How your prices compare to the market across all matched products.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>My price vs market average</CardTitle></CardHeader>
        <CardContent>
          <MarketPositionChart
            data={enriched
              .filter((r) => r.pctVsAvg != null)
              .slice(0, 30)
              .map((r) => ({
                name: r.my_name.slice(0, 30),
                pct: Number(r.pctVsAvg!.toFixed(2)),
              }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Per-product summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">My price</th>
                <th className="px-4 py-2">Market min</th>
                <th className="px-4 py-2">Market avg</th>
                <th className="px-4 py-2">Market max</th>
                <th className="px-4 py-2">vs avg</th>
                <th className="px-4 py-2">Competitors</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r) => (
                <tr key={r.my_id} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.my_name}</td>
                  <td className="px-4 py-2 tabular-nums">{r.myPrice?.toFixed(2) ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{r.market_min ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{r.market_avg ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{r.market_max ?? '—'}</td>
                  <td
                    className={`px-4 py-2 tabular-nums ${
                      r.pctVsAvg == null ? '' : r.pctVsAvg > 5 ? 'text-destructive' : r.pctVsAvg < -5 ? 'text-success' : ''
                    }`}
                  >
                    {r.pctVsAvg != null ? `${r.pctVsAvg > 0 ? '+' : ''}${r.pctVsAvg.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{Number(r.competitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
