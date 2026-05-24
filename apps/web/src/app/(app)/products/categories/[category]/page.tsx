import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/auth';
import { formatCurrency, formatPct } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getCategoryAnalytics } from '@/server/products/queries';

export const dynamic = 'force-dynamic';

export default async function ProductCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const ctx = await getContext();
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const data = await getCategoryAnalytics(ctx.orgId, decoded);
  if (data.rows.length === 0) notFound();

  const prices = data.rows.map((row) => row.currentAvgPrice).filter((price): price is number => price != null);
  const avg = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
  const volatile = data.rows.filter((row) => row.volatility >= 10).length;
  const discounted = data.rows.filter((row) => row.activeDiscounts > 0).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
          <p className="text-sm text-muted-foreground">{data.subtitle}</p>
        </div>
        <Button asChild variant="outline"><Link href={`/products?category=${encodeURIComponent(decoded)}`}>Open filtered products</Link></Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Products" value={data.rows.length.toLocaleString()} />
        <Metric label="Average price" value={formatCurrency(avg, data.rows[0]?.currency ?? 'EUR')} />
        <Metric label="Volatile products" value={volatile.toLocaleString()} />
        <Metric label="Discounted products" value={discounted.toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top brands</CardTitle>
          <CardDescription>Brand coverage and category volatility.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.summary.length === 0 ? <EmptyState title="No brand groups" /> : data.summary.map((group) => (
            <Link key={group.key} href={`/products/brands/${encodeURIComponent(group.label)}`} className="rounded-md border p-4 hover:bg-muted/40">
              <div className="font-medium">{group.label}</div>
              <div className="mt-2 text-2xl font-semibold">{group.count}</div>
              <div className="text-xs text-muted-foreground">{formatCurrency(group.avgPrice, 'EUR')} avg - {formatPct(group.volatility)} volatility</div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <ProductsSlice rows={data.rows} />
    </div>
  );
}

function ProductsSlice({ rows }: { rows: Awaited<ReturnType<typeof getCategoryAnalytics>>['rows'] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Products</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-y bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Product</th><th>Brand</th><th>Avg price</th><th>Stock</th><th>Volatility</th><th>Competitors</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-4 py-3"><Link href={`/products/${row.id}`} className="font-medium hover:underline">{row.canonicalTitle}</Link></td>
                <td>{row.brand ?? 'Unknown'}</td>
                <td className="tabular-nums">{formatCurrency(row.currentAvgPrice, row.currency)}</td>
                <td><Badge variant="secondary">{row.stockStatus.replace(/_/g, ' ')}</Badge></td>
                <td className="tabular-nums">{formatPct(row.volatility)}</td>
                <td className="tabular-nums">{row.competitorsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></CardContent></Card>
  );
}
