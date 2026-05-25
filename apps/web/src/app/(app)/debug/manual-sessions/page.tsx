import { desc, eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function variant(status: string) {
  if (status === 'completed' || status === 'preview_ready') return 'success';
  if (status === 'waiting_for_manual_action') return 'warning';
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  return 'secondary';
}

export default async function DebugManualSessionsPage() {
  const ctx = await getContext();
  const rows = await db()
    .select({
      session: schema.manualScrapingSessions,
      storeName: schema.stores.name,
    })
    .from(schema.manualScrapingSessions)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.manualScrapingSessions.competitorId))
    .where(eq(schema.manualScrapingSessions.orgId, ctx.orgId))
    .orderBy(desc(schema.manualScrapingSessions.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Manual sessions</h1>
        <p className="text-sm text-muted-foreground">Captcha takeover sessions, storage state, and recent logs.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2">Logs</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                    No manual sessions yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ session, storeName }) => (
                  <tr key={session.id} className="border-t align-top">
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(session.createdAt)}</td>
                    <td className="px-4 py-2">{storeName ?? 'n/a'}</td>
                    <td className="px-4 py-2">
                      <Badge variant={variant(session.status)}>{session.status}</Badge>
                    </td>
                    <td className="max-w-96 truncate px-4 py-2">{session.url}</td>
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(session.expiresAt)}</td>
                    <td className="px-4 py-2">
                      <pre className="max-h-32 max-w-96 overflow-auto rounded-md bg-muted p-2 text-xs">
                        {JSON.stringify(session.logs, null, 2)}
                      </pre>
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
