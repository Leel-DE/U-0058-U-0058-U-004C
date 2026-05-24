'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui/empty-state';
import type { AvailabilityOverview, CompetitorActivityRow, PriceMovementPoint } from '@/server/dashboard/types';

export function PriceMovementTimeline({ data }: { data: PriceMovementPoint[] }) {
  if (data.length === 0) {
    return <EmptyState title="No price changes" description="Price movement will appear after snapshots change." />;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickFormatter={(v) => shortDate(v)} />
          <YAxis tick={{ fontSize: 11 }} width={35} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => new Date(String(v)).toLocaleString()} />
          <Line type="monotone" dataKey="drops" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Drops" />
          <Line type="monotone" dataKey="increases" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Increases" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompetitorActivityChart({ data }: { data: CompetitorActivityRow[] }) {
  const chartData = data.slice(0, 10).map((row) => ({
    name: row.competitorName.length > 18 ? `${row.competitorName.slice(0, 18)}...` : row.competitorName,
    changes: row.changesToday,
    failed: row.failedRuns,
  }));
  if (chartData.length === 0) {
    return <EmptyState title="No competitor activity yet" description="Activity appears after crawls and snapshots." />;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 35, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={35} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="changes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Changes" />
          <Bar dataKey="failed" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Failed runs" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AvailabilityDistributionChart({ data }: { data: AvailabilityOverview }) {
  const chartData = data.distribution.filter((item) => item.value > 0);
  if (chartData.length === 0) {
    return <EmptyState title="No availability data" description="Availability appears after scraping products." />;
  }
  const colors = ['hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
            {chartData.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
};

function shortDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
