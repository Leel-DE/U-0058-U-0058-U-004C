import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { AnalyticsKpi } from '@/server/analytics/types';

export function AnalyticsKpiGrid({ data }: { data: AnalyticsKpi[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
      {data.map((card) => {
        const body = (
          <Card className="hover:border-primary/35 hover:bg-muted/20 h-full overflow-hidden transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground text-xs font-medium uppercase">
                  {card.label}
                </div>
                <StatusDot status={card.status} />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</div>
              <div className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                {card.delta == null ? null : card.delta >= 0 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {card.delta == null
                  ? 'No previous period'
                  : `${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)}% vs previous`}
              </div>
              <MiniSparkline values={card.sparkline.map((point) => point.value)} />
            </CardContent>
          </Card>
        );
        return card.href ? (
          <Link key={card.label} href={card.href}>
            {body}
          </Link>
        ) : (
          <div key={card.label}>{body}</div>
        );
      })}
    </div>
  );
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="bg-muted/40 mt-3 h-6 rounded" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = max === min ? 50 : 100 - ((value - min) / (max - min)) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      className="mt-3 h-6 w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        points={points}
        className="text-primary/70"
      />
    </svg>
  );
}

function StatusDot({ status }: { status: AnalyticsKpi['status'] }) {
  const cls =
    status === 'good'
      ? 'bg-success'
      : status === 'warning'
        ? 'bg-warning'
        : status === 'critical'
          ? 'bg-destructive'
          : 'bg-muted-foreground';
  return <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${cls}`} />;
}
