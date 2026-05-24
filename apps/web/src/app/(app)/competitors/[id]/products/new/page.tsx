import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { AddCompetitorProductForm } from './form';
import { BulkImport } from '@/app/(app)/products/_components/bulk-import';

export default async function NewCompetitorProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect(`/competitors/${id}`);
  const rows = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const store = rows[0];
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add product</h1>
        <p className="text-sm text-muted-foreground">
          Add competitor product URLs from <span className="font-medium">{store.name}</span> to start
          monitoring.
        </p>
      </header>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single URL</TabsTrigger>
          <TabsTrigger value="csv">Bulk (CSV)</TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <Card>
            <CardHeader><CardTitle>Product URL</CardTitle></CardHeader>
            <CardContent>
              <AddCompetitorProductForm storeId={store.id} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="csv">
          <Card>
            <CardHeader><CardTitle>Bulk import</CardTitle></CardHeader>
            <CardContent>
              <BulkImport
                mode="competitorProducts"
                storeId={store.id}
                helpText="Headers: url, external_id (optional), title (optional). UTF-8, comma-separated."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
