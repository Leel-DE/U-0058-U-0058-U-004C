import Link from 'next/link';
import { AlertTriangle, ArrowDown, BadgePercent, DatabaseZap, TrendingDown, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { MarketInsight } from '@/server/analytics/types';

export function MarketInsightsCards({ data }: { data: MarketInsight[] }) {
  if (data.length === 0) return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No insights for selected filters.</div>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.map((insight) => {
        const body = (
          <Card className="h-full hover:bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <InsightIcon type={insight.type} />
                <Badge variant={variant(insight.severity)}>{insight.metric}</Badge>
              </div>
              <div className="mt-3 font-medium">{insight.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
            </CardContent>
          </Card>
        );
        return insight.href ? <Link key={insight.id} href={insight.href}>{body}</Link> : <div key={insight.id}>{body}</div>;
      })}
    </div>
  );
}

function InsightIcon({ type }: { type: MarketInsight['type'] }) {
  const cls = 'h-5 w-5 text-muted-foreground';
  if (type === 'price_drop_trend') return <TrendingDown className="h-5 w-5 text-success" />;
  if (type === 'stock_instability') return <AlertTriangle className="h-5 w-5 text-warning" />;
  if (type === 'discount_spike') return <BadgePercent className="h-5 w-5 text-warning" />;
  if (type === 'stale_monitoring') return <DatabaseZap className="h-5 w-5 text-destructive" />;
  if (type === 'aggressive_competitor') return <Zap className="h-5 w-5 text-destructive" />;
  return <ArrowDown className={cls} />;
}

function variant(severity: MarketInsight['severity']) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'secondary';
}
