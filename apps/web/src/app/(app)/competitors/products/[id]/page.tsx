import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { formatCurrency, timeAgo } from '@/lib/utils';
import { PriceHistoryChart } from './_components/price-history-chart';
import { ManualSnapshotForm } from './_components/manual-snapshot-form';

export const dynamic = 'force-dynamic';

export default async function CompetitorProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getContext();

  const rows = await db()
    .select({
      product: schema.competitorProducts,
      store: schema.stores,
    })
    .from(schema.competitorProducts)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
    .where(
      and(
        eq(schema.competitorProducts.id, id),
        eq(schema.competitorProducts.orgId, ctx.orgId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const snapshots = await db()
    .select({
      id: schema.priceSnapshots.id,
      scrapedAt: schema.priceSnapshots.scrapedAt,
      price: schema.priceSnapshots.price,
      currency: schema.priceSnapshots.currency,
      availability: schema.priceSnapshots.availability,
      status: schema.priceSnapshots.status,
      source: schema.priceSnapshots.source,
    })
    .from(schema.priceSnapshots)
    .where(eq(schema.priceSnapshots.competitorProductId, id))
    .orderBy(asc(schema.priceSnapshots.scrapedAt))
    .limit(500);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/competitors/${row.store.id}`} className="hover:underline">
              {row.store.name}
            </Link>
            <span>·</span>
            <Badge variant="outline">
              {row.product.lastSnapshotAvailability ?? 'unknown'}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {row.product.title ?? row.product.url}
          </h1>
          <a
            href={row.product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View on store <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Latest price</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">
            {row.product.lastSnapshotPrice
              ? formatCurrency(row.product.lastSnapshotPrice, row.product.lastSnapshotCurrency ?? 'EUR')
              : '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Last scrape</CardTitle></CardHeader>
          <CardContent className="text-base">{timeAgo(row.product.lastScrapedAt)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Snapshots</CardTitle></CardHeader>
          <CardContent className="text-base">{snapshots.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Price history</CardTitle></CardHeader>
        <CardContent>
          <PriceHistoryChart
            data={snapshots
              .filter((s) => s.status === 'ok' && s.price)
              .map((s) => ({
                t: new Date(s.scrapedAt).getTime(),
                price: Number(s.price),
                currency: s.currency ?? '',
              }))}
          />
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader><CardTitle>Manual price entry</CardTitle></CardHeader>
          <CardContent>
            <ManualSnapshotForm
              competitorProductId={row.product.id}
              defaultCurrency={row.store.currency}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Recent scrape log</CardTitle></CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5">Time</th>
                  <th className="py-1.5">Price</th>
                  <th className="py-1.5">Availability</th>
                  <th className="py-1.5">Status</th>
                  <th className="py-1.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {snapshots
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((s) => (
                    <tr key={String(s.id)} className="border-t">
                      <td className="py-1.5">{new Date(s.scrapedAt).toLocaleString()}</td>
                      <td className="py-1.5 tabular-nums">
                        {s.price ? formatCurrency(s.price, s.currency ?? 'EUR') : '—'}
                      </td>
                      <td className="py-1.5">{s.availability ?? '—'}</td>
                      <td className="py-1.5">
                        <Badge variant={s.status === 'ok' ? 'success' : 'destructive'}>{s.status}</Badge>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{s.source}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
