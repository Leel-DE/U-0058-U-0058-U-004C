import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatCurrency, formatPct } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

interface Row extends Record<string, unknown> {
  competitor_product_id: string;
  title: string | null;
  currency: string;
  last_price: string;
  old_price: string;
  pct_change: string;
}

export async function TopMovers({ orgId, direction }: { orgId: string; direction: 'up' | 'down' }) {
  const orderClause = direction === 'down' ? sql`pct_change asc nulls last` : sql`pct_change desc nulls last`;
  const rows = await db().execute<Row>(sql`
    select competitor_product_id, title, currency, last_price, old_price, pct_change
    from v_price_movers
    where org_id = ${orgId}
      and pct_change is not null
      and ${direction === 'down' ? sql`pct_change < 0` : sql`pct_change > 0`}
    order by ${orderClause}
    limit 5
  `);

  if (rows.length === 0) {
    return <EmptyState title="No movement yet" description="Once snapshots accumulate this will populate." />;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.competitor_product_id} className="border-b last:border-0">
            <td className="py-2 pr-2">
              <Link
                href={`/competitors/products/${r.competitor_product_id}`}
                className="font-medium hover:underline"
              >
                {r.title ?? 'Untitled'}
              </Link>
            </td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(r.last_price, r.currency)}</td>
            <td
              className={`py-2 pl-2 text-right tabular-nums ${
                Number(r.pct_change) < 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {formatPct(Number(r.pct_change))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
