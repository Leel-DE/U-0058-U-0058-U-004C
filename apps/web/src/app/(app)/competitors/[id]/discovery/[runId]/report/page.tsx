import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { loadDiscoveryReport } from '@/server/actions/discovery';
import { DiscoveryReportClient } from '../../_components/discovery-report-client';

export default async function DiscoveryReportPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const ctx = await getContext();
  const stores = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const store = stores[0];
  if (!store) notFound();
  const report = await loadDiscoveryReport(store.id, runId);
  if (!report.run) notFound();

  const prices = report.products.map((p) => Number(p.price)).filter((price) => Number.isFinite(price) && price > 0);
  const summary = {
    pagesDiscovered: report.run.pagesDiscovered,
    pagesCrawled: report.run.pagesCrawled,
    categoriesFound: report.run.categoriesFound || report.categories.length,
    productsFound: report.run.productsFound || report.products.length,
    errors: report.run.errorsCount,
    averagePrice: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : undefined,
    minPrice: prices.length ? Math.min(...prices) : undefined,
    maxPrice: prices.length ? Math.max(...prices) : undefined,
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discovery report · {store.name}</h1>
          <p className="text-sm text-muted-foreground">{report.run.startUrl}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href={`/competitors/${store.id}/discovery/${runId}`}>Progress</Link></Button>
          <Button asChild variant="outline"><Link href={`/competitors/${store.id}/discovery`}>Discovery</Link></Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
        <Metric label="Pages found" value={summary.pagesDiscovered} />
        <Metric label="Crawled" value={summary.pagesCrawled} />
        <Metric label="Categories" value={summary.categoriesFound} />
        <Metric label="Products" value={summary.productsFound} />
        <Metric label="Errors" value={summary.errors} />
        <Metric label="Avg price" value={summary.averagePrice ? summary.averagePrice.toFixed(2) : '-'} />
        <Metric label="Min" value={summary.minPrice ? summary.minPrice.toFixed(2) : '-'} />
        <Metric label="Max" value={summary.maxPrice ? summary.maxPrice.toFixed(2) : '-'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog report</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscoveryReportClient
            storeId={store.id}
            runId={runId}
            products={report.products.map((p) => ({
              id: p.id,
              url: p.url,
              title: p.title,
              price: p.price == null ? null : String(p.price),
              oldPrice: p.oldPrice == null ? null : String(p.oldPrice),
              currency: p.currency,
              availability: p.availability,
              imageUrl: p.imageUrl,
              brand: p.brand,
              sku: p.sku,
              ean: p.ean,
              gtin: p.gtin,
              rating: p.rating == null ? null : String(p.rating),
              shipping: p.shipping,
              categoryPath: p.categoryPath,
              confidence: p.confidence == null ? null : String(p.confidence),
              source: p.source,
              rawCardJson: p.rawCardJson,
              rawDetailJson: p.rawDetailJson,
            }))}
            categories={report.categories.map((c) => ({
              id: c.id,
              url: c.url,
              name: c.name,
              path: c.path,
              productsFound: c.productsFound,
              breadcrumbs: c.breadcrumbs,
              confidence: c.confidence == null ? null : String(c.confidence),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
