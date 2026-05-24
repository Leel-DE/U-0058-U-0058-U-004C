import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default async function MyProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const rows = await db()
    .select()
    .from(schema.myProducts)
    .where(and(eq(schema.myProducts.id, id), eq(schema.myProducts.orgId, ctx.orgId)))
    .limit(1);
  const product = rows[0];
  if (!product) notFound();

  const matches = await db()
    .select({
      match: schema.productMatches,
      competitor: schema.competitorProducts,
      store: schema.stores,
    })
    .from(schema.productMatches)
    .innerJoin(
      schema.competitorProducts,
      eq(schema.productMatches.competitorProductId, schema.competitorProducts.id),
    )
    .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
    .where(
      and(
        eq(schema.productMatches.myProductId, product.id),
        eq(schema.productMatches.status, 'confirmed'),
      ),
    )
    .orderBy(desc(schema.productMatches.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <div className="text-sm text-muted-foreground">SKU {product.sku}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        {product.brand ? (
          <p className="text-sm text-muted-foreground">{product.brand}</p>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">My price</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {product.myPrice ? formatCurrency(product.myPrice, product.currency) : '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Linked competitors</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{matches.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Updated</CardTitle></CardHeader>
          <CardContent>{timeAgo(product.updatedAt)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Competitor lineup</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/matches">Find more matches</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No competitors linked yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Competitor</th>
                  <th className="py-2">Store</th>
                  <th className="py-2">Latest price</th>
                  <th className="py-2">Δ vs my price</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(({ match, competitor, store }) => {
                  const compPrice = competitor.lastSnapshotPrice ? Number(competitor.lastSnapshotPrice) : null;
                  const myPrice = product.myPrice ? Number(product.myPrice) : null;
                  const delta = compPrice != null && myPrice != null ? compPrice - myPrice : null;
                  return (
                    <tr key={match.id} className="border-t">
                      <td className="py-2">
                        <Link
                          href={`/competitors/products/${competitor.id}`}
                          className="font-medium hover:underline"
                        >
                          {competitor.title ?? competitor.url}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground">{store.name}</td>
                      <td className="py-2 tabular-nums">
                        {compPrice != null
                          ? formatCurrency(compPrice, competitor.lastSnapshotCurrency ?? product.currency)
                          : '—'}
                      </td>
                      <td className="py-2 tabular-nums">
                        {delta != null ? (
                          <Badge variant={delta < 0 ? 'destructive' : 'success'}>
                            {delta < 0 ? '−' : '+'}
                            {Math.abs(delta).toFixed(2)} {competitor.lastSnapshotCurrency ?? product.currency}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
