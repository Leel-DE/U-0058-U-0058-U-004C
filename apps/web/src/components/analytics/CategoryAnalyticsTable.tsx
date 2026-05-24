import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPct } from '@/lib/utils';
import type { CategoryAnalyticsRow } from '@/server/analytics/types';

export function CategoryAnalyticsTable({ data }: { data: CategoryAnalyticsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-sm">
        <thead className="sticky top-0 border-y bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Products</th>
            <th className="px-4 py-2">Competitors</th>
            <th className="px-4 py-2">Avg / median</th>
            <th className="px-4 py-2">Min / max</th>
            <th className="px-4 py-2">Discount</th>
            <th className="px-4 py-2">Stock</th>
            <th className="px-4 py-2">Volatility</th>
            <th className="px-4 py-2">Changes</th>
            <th className="px-4 py-2">Trend</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.category} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/analytics/categories?category=${encodeURIComponent(row.categoryId ?? row.category)}`}>{row.category}</Link></td>
              <td className="px-4 py-3 tabular-nums">{row.productsCount}</td>
              <td className="px-4 py-3 tabular-nums">{row.competitorsCount}</td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(row.avgPrice, 'EUR')} <span className="text-muted-foreground">/ {formatCurrency(row.medianPrice, 'EUR')}</span></td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(row.minPrice, 'EUR')} <span className="text-muted-foreground">/ {formatCurrency(row.maxPrice, 'EUR')}</span></td>
              <td className="px-4 py-3">{formatPct(row.avgDiscount)}</td>
              <td className="px-4 py-3">{Math.round(row.stockRatio * 100)}%</td>
              <td className="px-4 py-3"><Badge variant={row.volatilityScore >= 60 ? 'destructive' : row.volatilityScore >= 30 ? 'warning' : 'secondary'}>{Math.round(row.volatilityScore)}</Badge></td>
              <td className="px-4 py-3 tabular-nums">{row.priceChanges}</td>
              <td className="px-4 py-3">{row.trend}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
