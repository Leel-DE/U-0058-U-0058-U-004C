import { and, eq, desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { RefreshButton, DecisionButtons } from './_components/actions';
import { GitMerge } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const ctx = await getContext();

  const fetchRows = (status: 'suggested' | 'confirmed' | 'rejected') =>
    db()
      .select({
        match: schema.productMatches,
        myName: schema.myProducts.name,
        mySku: schema.myProducts.sku,
        compTitle: schema.competitorProducts.title,
        compId: schema.competitorProducts.id,
        storeName: schema.stores.name,
      })
      .from(schema.productMatches)
      .innerJoin(schema.myProducts, eq(schema.productMatches.myProductId, schema.myProducts.id))
      .innerJoin(
        schema.competitorProducts,
        eq(schema.productMatches.competitorProductId, schema.competitorProducts.id),
      )
      .innerJoin(schema.stores, eq(schema.competitorProducts.storeId, schema.stores.id))
      .where(
        and(
          eq(schema.productMatches.orgId, ctx.orgId),
          eq(schema.productMatches.status, status),
        ),
      )
      .orderBy(desc(schema.productMatches.confidence), desc(schema.productMatches.createdAt))
      .limit(200);

  const [suggested, confirmed] = await Promise.all([fetchRows('suggested'), fetchRows('confirmed')]);

  const canManage = ctx.role !== 'viewer';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="text-sm text-muted-foreground">
            Link your products to competitor SKUs so we can compare prices accurately.
          </p>
        </div>
        {canManage ? <RefreshButton /> : null}
      </header>

      <Tabs defaultValue="suggested">
        <TabsList>
          <TabsTrigger value="suggested">Suggested ({suggested.length})</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed ({confirmed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="suggested">
          {suggested.length === 0 ? (
            <EmptyState
              icon={<GitMerge className="h-8 w-8" />}
              title="No suggestions yet"
              description="Add products and competitors first, then click ‘Generate suggestions’."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">My product</th>
                      <th className="px-4 py-2">Competitor</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Confidence</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggested.map((r) => (
                      <tr key={r.match.id} className="border-t">
                        <td className="px-4 py-2">
                          <div className="font-medium">{r.myName}</div>
                          <div className="text-xs text-muted-foreground">{r.mySku}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{r.compTitle ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.storeName}</div>
                        </td>
                        <td className="px-4 py-2"><Badge variant="outline">{r.match.method}</Badge></td>
                        <td className="px-4 py-2 tabular-nums">
                          {Math.round(Number(r.match.confidence) * 100)}%
                        </td>
                        <td className="px-4 py-2">
                          <DecisionButtons matchId={r.match.id} disabled={!canManage} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="confirmed">
          {confirmed.length === 0 ? (
            <EmptyState icon={<GitMerge className="h-8 w-8" />} title="No confirmed matches yet" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">My product</th>
                      <th className="px-4 py-2">Competitor</th>
                      <th className="px-4 py-2">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmed.map((r) => (
                      <tr key={r.match.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{r.myName}</td>
                        <td className="px-4 py-2">
                          {r.compTitle ?? '—'}{' '}
                          <span className="text-xs text-muted-foreground">· {r.storeName}</span>
                        </td>
                        <td className="px-4 py-2"><Badge variant="outline">{r.match.method}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
