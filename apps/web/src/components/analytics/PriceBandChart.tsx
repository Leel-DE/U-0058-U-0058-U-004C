'use client';

import {
  Area,
  AreaChart,
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
import type { MarketTrendPoint } from '@/server/analytics/types';

export function PriceBandChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="bucket"
            minTickGap={28}
            tick={chartAxisTick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis width={72} tick={chartAxisTick} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            cursor={chartCursorStyle}
          />
          <Legend wrapperStyle={chartLegendStyle} />
          <Area
            type="monotone"
            dataKey="maxPrice"
            name="Max"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.12}
          />
          <Area
            type="monotone"
            dataKey="averagePrice"
            name="Avg"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.18}
          />
          <Area
            type="monotone"
            dataKey="minPrice"
            name="Min"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
