import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  BadgePercent,
  DatabaseZap,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MarketInsight } from '@/server/analytics/types';

export function MarketInsightsCards({ data }: { data: MarketInsight[] }) {
  if (data.length === 0) {
    return (
      <div className="border-border/80 bg-muted/20 text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        No insights for selected filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.map((insight) => {
        const body = (
          <div className="border-border/70 bg-muted/20 hover:border-primary/40 hover:bg-muted/35 h-full rounded-md border p-4 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <span className="bg-background/70 ring-border/70 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1">
                <InsightIcon type={insight.type} />
              </span>
              <Badge variant={variant(insight.severity)}>{insight.metric}</Badge>
            </div>
            <div className="mt-3 font-medium leading-snug">{insight.title}</div>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{insight.description}</p>
          </div>
        );
        return insight.href ? (
          <Link key={insight.id} href={insight.href} className="block h-full">
            {body}
          </Link>
        ) : (
          <div key={insight.id}>{body}</div>
        );
      })}
    </div>
  );
}

function InsightIcon({ type }: { type: MarketInsight['type'] }) {
  const cls = 'h-4 w-4 text-muted-foreground';
  if (type === 'price_drop_trend') return <TrendingDown className="text-success h-4 w-4" />;
  if (type === 'stock_instability') return <AlertTriangle className="text-warning h-4 w-4" />;
  if (type === 'discount_spike') return <BadgePercent className="text-warning h-4 w-4" />;
  if (type === 'stale_monitoring') return <DatabaseZap className="text-destructive h-4 w-4" />;
  if (type === 'aggressive_competitor') return <Zap className="text-destructive h-4 w-4" />;
  return <ArrowDown className={cls} />;
}

function variant(severity: MarketInsight['severity']) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'secondary';
}
