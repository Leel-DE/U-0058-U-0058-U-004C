import Link from 'next/link';
import { GitCompare } from 'lucide-react';
import { getContext } from '@/lib/auth';
import { formatCurrency, formatPct } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getCompareProducts } from '@/server/products/queries';
import { ProductPriceTimeline, ProductSpreadChart } from '../_components/product-charts';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const ids = parseIds(params.ids);
  const products = await getCompareProducts(ctx.orgId, ids);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product comparison</h1>
          <p className="text-sm text-muted-foreground">Compare selected normalized products across market metrics and history.</p>
        </div>
        <Button asChild variant="outline"><Link href="/products">Back to products</Link></Button>
      </header>

      {products.length === 0 ? (
        <EmptyState
          icon={<GitCompare className="h-8 w-8" />}
          title="No products selected"
          description="Open the products intelligence table and compare visible or selected products."
          action={<Button asChild><Link href="/products">Open products</Link></Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <Card key={product.id}>
                <CardHeader>
                  <CardTitle className="line-clamp-2 text-base">{product.canonicalTitle}</CardTitle>
                  <CardDescription>{product.brand ?? 'Unknown brand'} - {product.category ?? 'Uncategorized'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Metric label="Avg price" value={formatCurrency(product.overview.averagePrice, product.overview.currency)} />
                  <Metric label="Spread" value={formatCurrency(product.overview.competitorSpread, product.overview.currency)} />
                  <Metric label="Stock ratio" value={`${Math.round(product.overview.stockRatio * 100)}%`} />
                  <Metric label="Volatility" value={formatPct(product.overview.volatilityScore)} />
                  <Button asChild size="sm" variant="outline" className="w-full"><Link href={`/products/${product.id}`}>Open detail</Link></Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comparison matrix</CardTitle>
              <CardDescription>Current market position by product.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-y bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Competitors</th>
                    <th className="px-4 py-2">Cheapest</th>
                    <th className="px-4 py-2">Avg price</th>
                    <th className="px-4 py-2">Highest</th>
                    <th className="px-4 py-2">Discount</th>
                    <th className="px-4 py-2">Trend</th>
                    <th className="px-4 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b last:border-0">
                      <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/products/${product.id}`}>{product.canonicalTitle}</Link></td>
                      <td className="px-4 py-3 tabular-nums">{product.competitorsCount}</td>
                      <td className="px-4 py-3">{product.overview.cheapestCompetitor ?? 'none'}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(product.overview.averagePrice, product.overview.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(product.overview.highestPrice, product.overview.currency)}</td>
                      <td className="px-4 py-3">{product.overview.currentDiscountPct == null ? 'none' : <Badge variant="warning">{formatPct(product.overview.currentDiscountPct)}</Badge>}</td>
                      <td className="px-4 py-3">{product.overview.marketTrend}</td>
                      <td className="px-4 py-3 tabular-nums">{Math.round(product.confidence * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {products.slice(0, 2).map((product) => (
              <Card key={`${product.id}-chart`}>
                <CardHeader><CardTitle className="line-clamp-1">{product.canonicalTitle}</CardTitle></CardHeader>
                <CardContent>
                  <ProductPriceTimeline data={product.priceTimeline} />
                  <ProductSpreadChart data={product.spreadTimeline} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function parseIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}
