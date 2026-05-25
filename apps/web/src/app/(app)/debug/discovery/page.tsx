import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function variant(status: string) {
  if (status === 'success' || status === 'completed') return 'success';
  if (status === 'running' || status === 'queued') return 'secondary';
  if (status === 'partial' || status === 'paused') return 'warning';
  return 'destructive';
}

export default async function DebugDiscoveryPage() {
  const ctx = await getContext();
  const rows = await db()
    .select({
      run: schema.siteDiscoveryRuns,
      storeName: schema.stores.name,
    })
    .from(schema.siteDiscoveryRuns)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.siteDiscoveryRuns.competitorId))
    .where(eq(schema.siteDiscoveryRuns.orgId, ctx.orgId))
    .orderBy(desc(schema.siteDiscoveryRuns.startedAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Discovery debug</h1>
        <p className="text-sm text-muted-foreground">Recent discovery runs, progress, errors, and saved reports.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Pages</th>
                <th className="px-4 py-2">Products</th>
                <th className="px-4 py-2">Errors</th>
                <th className="px-4 py-2">Report</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                    No discovery runs yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ run, storeName }) => (
                  <tr key={run.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(run.startedAt ?? undefined)}</td>
                    <td className="px-4 py-2">{storeName}</td>
                    <td className="px-4 py-2">
                      <Badge variant={variant(run.status)}>{run.status}</Badge>
                    </td>
                    <td className="px-4 py-2">{run.pagesCrawled}/{run.pagesDiscovered}</td>
                    <td className="px-4 py-2">{run.productsFound}</td>
                    <td className="px-4 py-2">{run.errorsCount}</td>
                    <td className="px-4 py-2">
                      <Link className="text-primary underline-offset-4 hover:underline" href={`/competitors/${run.competitorId}/discovery?run=${run.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
