'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';

interface Point {
  t: number;
  price: number;
  currency: string;
}

export function PriceHistoryChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <EmptyState title="No history yet" description="Snapshots will appear here once collected." />;
  }
  const min = Math.min(...data.map((d) => d.price));
  const max = Math.max(...data.map((d) => d.price));
  const padding = (max - min) * 0.1 || 1;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => format(new Date(v), 'MMM d')}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <YAxis
            domain={[min - padding, max + padding]}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-muted-foreground"
            tickFormatter={(v) => v.toFixed(0)}
            width={50}
          />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
            labelFormatter={(v) => format(new Date(v as number), 'PPpp')}
            formatter={(v: number, _name, props) => [`${v} ${props.payload.currency}`, 'Price']}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
