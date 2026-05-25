import { desc, eq } from 'drizzle-orm';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { rollbackSelectorVersionAction } from '@/server/actions/selectors';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DebugSelectorsPage() {
  const ctx = await getContext();
  const rows = await db()
    .select({
      version: schema.selectorVersions,
      storeName: schema.stores.name,
    })
    .from(schema.selectorVersions)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.selectorVersions.storeId))
    .where(eq(schema.stores.orgId, ctx.orgId))
    .orderBy(desc(schema.selectorVersions.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Selector history</h1>
        <p className="text-sm text-muted-foreground">Versioned selector changes with rollback.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Recent versions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Version</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Selector</th>
                <th className="px-4 py-2">Previous</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                    No selector versions recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ version, storeName }) => (
                  <tr key={version.id} className="border-t">
                    <td className="px-4 py-2">{storeName}</td>
                    <td className="px-4 py-2">{version.selectorType}</td>
                    <td className="px-4 py-2">v{version.version}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary">{version.source}</Badge>
                    </td>
                    <td className="max-w-80 truncate px-4 py-2 font-mono text-xs">{version.selectorValue}</td>
                    <td className="max-w-64 truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                      {version.previousSelectorValue ?? 'none'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{timeAgo(version.createdAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={async () => {
                        'use server';
                        await rollbackSelectorVersionAction({ selectorVersionId: version.id });
                      }}>
                        <Button type="submit" variant="outline" size="sm">Rollback</Button>
                      </form>
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
