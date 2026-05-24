import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Download } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { ExportActions, NewExportButtons } from './_components/actions';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const ctx = await getContext();
  const rows = await db()
    .select()
    .from(schema.exports_)
    .where(eq(schema.exports_.orgId, ctx.orgId))
    .orderBy(desc(schema.exports_.createdAt))
    .limit(50);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
          <p className="text-sm text-muted-foreground">Download CSV/XLSX snapshots of your data.</p>
        </div>
        {canManage ? <NewExportButtons /> : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState icon={<Download className="h-8 w-8" />} title="No exports yet" />
      ) : (
        <Card>
          <CardHeader><CardTitle>Recent exports</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Rows</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.kind}</td>
                    <td className="px-4 py-2 tabular-nums">{r.rowCount ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(r.createdAt)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.status === 'ready' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.status === 'ready' ? <ExportActions id={r.id} /> : null}
                    </td>
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
