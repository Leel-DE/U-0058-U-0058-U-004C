import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';

type SearchParams = Record<string, string | string[] | undefined>;

export function AnalyticsFilters({
  current,
  options,
}: {
  current: SearchParams;
  options: AnalyticsFilterOptions;
}) {
  return (
    <Card className="sticky top-0 z-20 border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <CardContent className="p-4">
        <form className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[120px_220px_200px_180px_1fr]">
            <select name="range" defaultValue={field(current.range) ?? '30d'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="90d">90d</option>
              <option value="1y">1y</option>
              <option value="all">All time</option>
            </select>
            <select name="competitor" defaultValue={field(current.competitor) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All competitors</option>
              {options.competitors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="category" defaultValue={field(current.category) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All categories</option>
              {options.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="brand" defaultValue={field(current.brand) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="all">All brands</option>
              {options.brands.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <Button type="submit">Apply</Button>
              <Button asChild variant="outline"><Link href="/analytics">Reset</Link></Button>
            </div>
          </div>

          <details className="rounded-md border p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="h-4 w-4" /> Advanced analytics filters
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <select name="availability" defaultValue={field(current.availability) ?? 'all'} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="all">Any availability</option>
                <option value="in_stock">In stock</option>
                <option value="out_of_stock">Out of stock</option>
                <option value="unknown">Unknown</option>
              </select>
              <input name="minPrice" defaultValue={field(current.minPrice)} placeholder="Min price" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="maxPrice" defaultValue={field(current.maxPrice)} placeholder="Max price" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="minVolatility" defaultValue={field(current.minVolatility)} placeholder="Min volatility" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <input name="maxVolatility" defaultValue={field(current.maxVolatility)} placeholder="Max volatility" className="h-10 rounded-md border bg-background px-3 text-sm" />
              <FlagSelect name="discountOnly" label="Discount only" value={field(current.discountOnly)} />
              <FlagSelect name="inStockOnly" label="In stock only" value={field(current.inStockOnly)} />
              <FlagSelect name="staleOnly" label="Stale only" value={field(current.staleOnly)} />
              <FlagSelect name="lowConfidenceOnly" label="Low confidence" value={field(current.lowConfidenceOnly)} />
              <FlagSelect name="reviewedOnly" label="Reviewed only" value={field(current.reviewedOnly)} />
              <FlagSelect name="changesOnly" label="Products with changes" value={field(current.changesOnly)} />
              <FlagSelect name="stockChangesOnly" label="Stock changes" value={field(current.stockChangesOnly)} />
            </div>
          </details>
        </form>
      </CardContent>
    </Card>
  );
}

function FlagSelect({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <select name={name} defaultValue={value ?? 'false'} className="h-10 rounded-md border bg-background px-3 text-sm">
      <option value="false">{label}: off</option>
      <option value="true">{label}: on</option>
    </select>
  );
}

function field(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
