import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
import { desc, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { formatCurrency, timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const ctx = await getContext();
  const [mine, competitors] = await Promise.all([
    db()
      .select()
      .from(schema.myProducts)
      .where(eq(schema.myProducts.orgId, ctx.orgId))
      .orderBy(desc(schema.myProducts.createdAt))
      .limit(200),
    db()
      .select({
        id: schema.competitorProducts.id,
        title: schema.competitorProducts.title,
        url: schema.competitorProducts.url,
        lastSnapshotPrice: schema.competitorProducts.lastSnapshotPrice,
        lastSnapshotCurrency: schema.competitorProducts.lastSnapshotCurrency,
        lastScrapedAt: schema.competitorProducts.lastScrapedAt,
        storeName: schema.stores.name,
        storeId: schema.stores.id,
      })
      .from(schema.competitorProducts)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
      .where(eq(schema.competitorProducts.orgId, ctx.orgId))
      .orderBy(desc(schema.competitorProducts.createdAt))
      .limit(500),
  ]);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Your catalog and the competitor SKUs we are monitoring.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/products/new">
              <Plus className="mr-1 h-4 w-4" /> Add my product
            </Link>
          </Button>
        ) : null}
      </header>

      <Tabs defaultValue="competitors">
        <TabsList>
          <TabsTrigger value="competitors">Competitor products ({competitors.length})</TabsTrigger>
          <TabsTrigger value="mine">My products ({mine.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="competitors">
          {competitors.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No competitor products yet"
              description="Add a store first, then add product URLs to monitor."
              action={
                canManage ? (
                  <Button asChild>
                    <Link href="/competitors">Go to competitors</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Store</th>
                      <th className="px-4 py-2">Latest price</th>
                      <th className="px-4 py-2">Last scrape</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2">
                          <Link
                            href={`/competitors/products/${p.id}`}
                            className="line-clamp-1 font-medium hover:underline"
                          >
                            {p.title ?? p.url}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          <Link href={`/competitors/${p.storeId}`} className="hover:underline">
                            {p.storeName}
                          </Link>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {p.lastSnapshotPrice
                            ? formatCurrency(p.lastSnapshotPrice, p.lastSnapshotCurrency ?? 'EUR')
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{timeAgo(p.lastScrapedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {mine.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No products yet"
              description="Add your catalog so we can match it against competitors."
              action={
                canManage ? (
                  <Button asChild>
                    <Link href="/products/new">Add my product</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">SKU</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Brand</th>
                      <th className="px-4 py-2">My price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-2">
                          <Link href={`/products/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{p.brand ?? '—'}</td>
                        <td className="px-4 py-2 tabular-nums">
                          {p.myPrice ? formatCurrency(p.myPrice, p.currency) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
