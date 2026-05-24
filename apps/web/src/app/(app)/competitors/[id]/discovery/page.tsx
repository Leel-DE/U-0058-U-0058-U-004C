import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { DiscoveryStartForm } from './_components/discovery-start-form';
import { loadDiscoveryRuns } from '@/server/actions/discovery';

export default async function DiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const rows = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const store = rows[0];
  if (!store) notFound();
  const runs = await loadDiscoveryRuns(store.id);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site discovery · {store.name}</h1>
          <p className="text-sm text-muted-foreground">
            Crawl sitemap, navigation, categories, product listings, and product cards for this competitor.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/competitors/${store.id}`}>Back to competitor</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Start discovery</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscoveryStartForm
            storeId={store.id}
            defaultUrl={`https://${store.domain}`}
            savedPreset={store.discoveryPreset}
            savedDefaults={store.discoveryDefaultsJson}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent discovery runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No discovery runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{run.startUrl}</div>
                    <div className="text-muted-foreground">
                      {run.pagesCrawled}/{run.pagesDiscovered} pages · {run.categoriesFound} categories · {run.productsFound} products
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={run.status === 'success' ? 'success' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                      {run.status}
                    </Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/competitors/${store.id}/discovery/${run.id}`}>Open</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/competitors/${store.id}/discovery/${run.id}/report`}>Report</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
