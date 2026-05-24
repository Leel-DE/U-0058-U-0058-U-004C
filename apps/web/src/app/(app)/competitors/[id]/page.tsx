import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, desc, sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { timeAgo } from '@/lib/utils';
import { Plus } from 'lucide-react';

export default async function CompetitorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const rows = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const store = rows[0];
  if (!store) notFound();

  const productCount = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.competitorProducts)
    .where(eq(schema.competitorProducts.storeId, store.id));

  const recentRuns = await db()
    .select()
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.storeId, store.id))
    .orderBy(desc(schema.scrapeRuns.createdAt))
    .limit(5);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
          <p className="text-sm text-muted-foreground">{store.domain}</p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/competitors/${store.id}/discovery`}>Site discovery</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/competitors/${store.id}/rules`}>Scraping rules</Link>
            </Button>
            <Button asChild>
              <Link href={`/competitors/${store.id}/products/new`}>
                <Plus className="mr-1 h-4 w-4" /> Add product
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Store health</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status">
              <Badge variant={store.status === 'active' ? 'success' : 'destructive'}>{store.status}</Badge>
            </Row>
            <Row label="Last successful scrape">{timeAgo(store.lastSuccessfulScrapeAt)}</Row>
            <Row label="Error rate (24h)">{store.errorRate24h ? `${(Number(store.errorRate24h) * 100).toFixed(1)}%` : '—'}</Row>
            <Row label="Avg response">{store.avgResponseMs ? `${store.avgResponseMs} ms` : '—'}</Row>
            <Row label="robots.txt">{store.robotsTxtStatus ?? 'not checked'}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Country">{store.countryCode}</Row>
            <Row label="Currency">{store.currency}</Row>
            <Row label="Crawl every">{store.crawlFrequencyMinutes} min</Row>
            <Row label="Per-request delay">{store.crawlDelaySeconds} s</Row>
            <Row label="Respects robots.txt">{store.respectRobots ? 'Yes' : 'No'}</Row>
            <Row label="JS required">{store.jsRequired ? 'Yes' : 'No'}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Products monitored</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tabular-nums">{productCount[0]?.count ?? 0}</div>
            <Button asChild variant="link" className="mt-2 px-0">
              <Link href={`/products?store=${store.id}`}>View products →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent scrape runs</CardTitle></CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Products</th>
                  <th className="py-2">Triggered by</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{timeAgo(r.createdAt)}</td>
                    <td className="py-2">
                      <Badge variant={r.status === 'success' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {r.productsOk}/{r.productsTotal} ok
                    </td>
                    <td className="py-2 text-muted-foreground">{r.triggeredBy}</td>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
