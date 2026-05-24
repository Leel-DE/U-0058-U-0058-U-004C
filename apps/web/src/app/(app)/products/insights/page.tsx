import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, Sparkles, TrendingUp } from 'lucide-react';
import { getContext } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getProductInsights } from '@/server/products/queries';
import type { ProductInsight } from '@/server/products/types';

export const dynamic = 'force-dynamic';

export default async function ProductInsightsPage() {
  const ctx = await getContext();
  const insights = await getProductInsights(ctx.orgId);
  const groups = groupInsights(insights);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Product insights</h1>
          <p className="text-sm text-muted-foreground">
            Actionable product intelligence from prices, stock, discounts, volatility, and competitor behavior.
          </p>
        </div>
        <Button asChild variant="outline"><Link href="/products">Back to products</Link></Button>
      </header>

      {insights.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No product insights yet"
          description="Insights appear after products have multiple snapshots, matches, and current prices."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.type}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{labelForType(group.type)}</CardTitle>
                    <CardDescription>{descriptionForType(group.type)}</CardDescription>
                  </div>
                  <InsightIcon type={group.type} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.items.map((insight) => (
                  <Link
                    key={insight.id}
                    href={insight.href ?? '/products'}
                    className="block rounded-md border p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="line-clamp-1 font-medium">{insight.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{insight.description}</div>
                      </div>
                      <Badge variant={badgeVariant(insight.severity)}>{insight.metric}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function groupInsights(insights: ProductInsight[]) {
  const map = new Map<string, ProductInsight[]>();
  for (const insight of insights) {
    const group = map.get(insight.type) ?? [];
    group.push(insight);
    map.set(insight.type, group);
  }
  return Array.from(map.entries()).map(([type, items]) => ({ type, items }));
}

function labelForType(type: string) {
  if (type === 'biggest_price_drops') return 'Biggest price drops';
  if (type === 'biggest_price_increases') return 'Biggest price increases';
  if (type === 'unstable_products') return 'Unstable products';
  if (type === 'most_discounted') return 'Most discounted';
  if (type === 'stock_recovery_or_disappearing') return 'Stock recovery and disappearing products';
  return type.replace(/_/g, ' ');
}

function descriptionForType(type: string) {
  if (type === 'unstable_products') return 'Products with the highest historical price spread.';
  if (type === 'most_discounted') return 'Products currently promoted by competitors.';
  if (type.includes('stock')) return 'Products with stock pressure or recovery signals.';
  return 'Ranked from current and historical snapshots.';
}

function InsightIcon({ type }: { type: string }) {
  if (type.includes('drop')) return <ArrowDown className="h-5 w-5 text-success" />;
  if (type.includes('increase')) return <ArrowUp className="h-5 w-5 text-destructive" />;
  if (type.includes('unstable')) return <AlertTriangle className="h-5 w-5 text-warning" />;
  return <TrendingUp className="h-5 w-5 text-muted-foreground" />;
}

function badgeVariant(severity: ProductInsight['severity']) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'secondary';
}
