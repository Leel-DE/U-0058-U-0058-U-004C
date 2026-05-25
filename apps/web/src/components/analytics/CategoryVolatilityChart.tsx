'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  chartAxisTick,
  chartCursorStyle,
  chartGridStroke,
  chartLegendStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from '@/components/analytics/chart-theme';
import type { CategoryAnalyticsRow } from '@/server/analytics/types';

export function CategoryVolatilityChart({ data }: { data: CategoryAnalyticsRow[] }) {
  const rows = data.slice(0, 18).map((row) => ({
    name: row.category,
    volatility: row.volatilityScore,
    discount: row.avgDiscount,
    stockRatio: Math.round(row.stockRatio * 100),
  }));
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-20}
            height={72}
            tick={{ ...chartAxisTick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis width={52} tick={chartAxisTick} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            cursor={chartCursorStyle}
          />
          <Legend wrapperStyle={chartLegendStyle} />
          <Bar dataKey="volatility" fill="#a855f7" />
          <Bar dataKey="discount" fill="#f97316" />
          <Bar dataKey="stockRatio" fill="#22c55e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
