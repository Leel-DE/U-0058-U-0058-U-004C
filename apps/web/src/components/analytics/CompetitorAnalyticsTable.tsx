import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import type { CompetitorAnalyticsRow } from '@/server/analytics/types';

export function CompetitorAnalyticsTable({ data }: { data: CompetitorAnalyticsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-sm">
        <thead className="sticky top-0 border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Competitor</th>
            <th className="px-4 py-2">Products</th>
            <th className="px-4 py-2">Avg / median price</th>
            <th className="px-4 py-2">Discount</th>
            <th className="px-4 py-2">Stock ratio</th>
            <th className="px-4 py-2">Moves</th>
            <th className="px-4 py-2">Failed</th>
            <th className="px-4 py-2">Last crawl</th>
            <th className="px-4 py-2">Aggressive</th>
            <th className="px-4 py-2">Volatility</th>
            <th className="px-4 py-2">Quality</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.competitorId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/analytics/competitors?competitor=${row.competitorId}`}>{row.competitorName}</Link></td>
              <td className="px-4 py-3 tabular-nums">{row.monitoredProducts}</td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(row.avgPrice, 'EUR')} <span className="text-muted-foreground">/ {formatCurrency(row.medianPrice, 'EUR')}</span></td>
              <td className="px-4 py-3">{formatPct(row.avgDiscount)}</td>
              <td className="px-4 py-3">{Math.round(row.stockRatio * 100)}%</td>
              <td className="px-4 py-3 tabular-nums">{row.priceChanges} <span className="text-success">-{row.priceDrops}</span> <span className="text-destructive">+{row.priceIncreases}</span></td>
              <td className="px-4 py-3 tabular-nums">{row.failedScrapes}</td>
              <td className="px-4 py-3 text-muted-foreground">{timeAgo(row.lastCrawl)}</td>
              <td className="px-4 py-3"><ScoreBadge value={row.aggressivenessScore} /></td>
              <td className="px-4 py-3"><ScoreBadge value={row.volatilityScore} /></td>
              <td className="px-4 py-3"><ScoreBadge value={row.dataQualityScore} inverse /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const bad = inverse ? value < 60 : value >= 60;
  const warn = inverse ? value < 80 : value >= 30;
  return <Badge variant={bad ? 'destructive' : warn ? 'warning' : 'secondary'}>{Math.round(value)}</Badge>;
}
