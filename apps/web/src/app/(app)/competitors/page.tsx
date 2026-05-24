import Link from 'next/link';
import { Plus, AlertCircle } from 'lucide-react';
import { desc, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage() {
  const ctx = await getContext();
  const stores = await db()
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.orgId, ctx.orgId))
    .orderBy(desc(schema.stores.createdAt));

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <p className="text-sm text-muted-foreground">Stores you are monitoring.</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/competitors/new">
              <Plus className="mr-1 h-4 w-4" /> Add competitor
            </Link>
          </Button>
        ) : null}
      </header>

      {stores.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="No competitors yet"
          description="Add the first store you want to monitor."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/competitors/new">Add competitor</Link>
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
                  <th className="px-4 py-2">Store</th>
                  <th className="px-4 py-2">Domain</th>
                  <th className="px-4 py-2">Country</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Last scrape</th>
                  <th className="px-4 py-2">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link href={`/competitors/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.domain}</td>
                    <td className="px-4 py-3">{s.countryCode}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'active' ? 'success' : s.status === 'paused' ? 'secondary' : 'destructive'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(s.lastSuccessfulScrapeAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.crawlFrequencyMinutes} min</td>
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
