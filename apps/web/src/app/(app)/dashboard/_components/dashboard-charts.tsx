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
import {
  chartAxisTick,
  chartCursorStyle,
  chartGridStroke,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from '@/components/analytics/chart-theme';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  AvailabilityOverview,
  CompetitorActivityRow,
  PriceMovementPoint,
} from '@/server/dashboard/types';

const compactChartMargin = { top: 10, right: 18, bottom: 10, left: 0 };

export function PriceMovementTimeline({ data }: { data: PriceMovementPoint[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No price changes"
        description="Price movement will appear after snapshots change."
      />
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={compactChartMargin}>
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="bucket"
            tick={{ ...chartAxisTick, fontSize: 11 }}
            tickFormatter={(v) => shortDate(v)}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ ...chartAxisTick, fontSize: 11 }}
            width={35}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            cursor={chartCursorStyle}
            labelFormatter={(v) => new Date(String(v)).toLocaleString()}
          />
          <Line
            type="monotone"
            dataKey="drops"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={false}
            name="Drops"
          />
          <Line
            type="monotone"
            dataKey="increases"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={false}
            name="Increases"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompetitorActivityChart({ data }: { data: CompetitorActivityRow[] }) {
  const chartData = data
    .filter((row) => row.changesToday > 0 || row.failedRuns > 0)
    .slice(0, 10)
    .map((row) => ({
      name:
        row.competitorName.length > 18
          ? `${row.competitorName.slice(0, 18)}...`
          : row.competitorName,
      changes: row.changesToday,
      failed: row.failedRuns,
    }));
  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No competitor activity yet"
        description="Activity appears after crawls and snapshots."
      />
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 18, bottom: 46, left: 0 }}
          barCategoryGap="34%"
        >
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="name"
            tick={{ ...chartAxisTick, fontSize: 10 }}
            angle={-28}
            textAnchor="end"
            interval={0}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ ...chartAxisTick, fontSize: 11 }}
            width={35}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            cursor={chartCursorStyle}
          />
          <Bar
            dataKey="changes"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            name="Changes"
            maxBarSize={48}
          />
          <Bar
            dataKey="failed"
            fill="hsl(var(--destructive))"
            radius={[4, 4, 0, 0]}
            name="Failed runs"
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AvailabilityDistributionChart({ data }: { data: AvailabilityOverview }) {
  const chartData = data.distribution.filter((item) => item.value > 0);
  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No availability data"
        description="Availability appears after scraping products."
      />
    );
  }
  const colors = ['hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
            stroke="hsl(var(--card))"
            strokeWidth={2}
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
