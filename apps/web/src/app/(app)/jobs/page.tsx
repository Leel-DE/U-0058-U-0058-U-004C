import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ListTodo } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const ctx = await getContext();
  const runs = await db()
    .select({
      run: schema.scrapeRuns,
      storeName: schema.stores.name,
    })
    .from(schema.scrapeRuns)
    .leftJoin(schema.stores, eq(schema.scrapeRuns.storeId, schema.stores.id))
    .where(eq(schema.scrapeRuns.orgId, ctx.orgId))
    .orderBy(desc(schema.scrapeRuns.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground">Recent scrape runs across your stores.</p>
      </header>
      {runs.length === 0 ? (
        <EmptyState icon={<ListTodo className="h-8 w-8" />} title="No runs yet" />
      ) : (
        <Card>
          <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Store</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Products</th>
                  <th className="px-4 py-2">Triggered by</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(({ run, storeName }) => (
                  <tr key={run.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(run.createdAt)}</td>
                    <td className="px-4 py-2">{storeName ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant={run.status === 'success' ? 'success' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {run.productsOk}/{run.productsTotal} ok
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{run.triggeredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
