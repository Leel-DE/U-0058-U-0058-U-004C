import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import type { ProductMovementRow, ProductMovements } from '@/server/analytics/types';

export function ProductMovementTables({ data }: { data: ProductMovements }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MovementCard title="Biggest price drops" rows={data.biggestDrops} tone="good" />
      <MovementCard title="Biggest price increases" rows={data.biggestIncreases} tone="bad" />
      <MovementCard title="Most volatile products" rows={data.mostVolatile} />
      <MovementCard title="Most discounted products" rows={data.mostDiscounted} tone="warn" />
      <MovementCard title="Most frequently changing products" rows={data.mostFrequentlyChanging} />
      <MovementCard title="Products with missing prices" rows={data.missingPrices} tone="bad" />
      <MovementCard title="Products with stale data" rows={data.staleProducts} tone="warn" />
    </div>
  );
}

export function MovementCard({ title, rows, tone = 'neutral' }: { title: string; rows: ProductMovementRow[]; tone?: 'neutral' | 'good' | 'bad' | 'warn' }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{rows.length} rows</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No data for selected filters.</div>
        ) : (
          <table className="w-full min-w-[680px] text-sm">
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={`${title}-${row.competitorProductId}-${row.timestamp}`} className="border-t">
                  <td className="px-4 py-3">
                    <Link className="line-clamp-1 font-medium hover:underline" href={row.href}>{row.productTitle}</Link>
                    <div className="text-xs text-muted-foreground">{row.competitorName} - {timeAgo(row.timestamp)}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div>{formatCurrency(row.newPrice, row.currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(row.oldPrice, row.currency)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={tone === 'bad' ? 'destructive' : tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'secondary'}>
                      {row.deltaPct != null ? formatPct(row.deltaPct) : row.metric != null ? Math.round(row.metric) : '-'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
