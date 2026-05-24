import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { DiscoveryProgress } from '../_components/discovery-progress';

export default async function DiscoveryRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const ctx = await getContext();
  const rows = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const store = rows[0];
  if (!store) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discovery progress · {store.name}</h1>
          <p className="text-sm text-muted-foreground">{runId}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/competitors/${store.id}/discovery`}>Back</Link>
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Run status</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscoveryProgress storeId={store.id} runId={runId} />
        </CardContent>
      </Card>
    </div>
  );
}

