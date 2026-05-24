'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui/empty-state';

interface Point {
  name: string;
  pct: number;
}

export function MarketPositionChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <EmptyState title="Not enough matched products" description="Confirm some matches to populate analytics." />;
  }
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
            formatter={(v: number) => [`${v.toFixed(2)}%`, 'vs avg']}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pct > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
