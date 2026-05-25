'use client';

import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

export function MarketTrendChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
          <Line
            type="monotone"
            dataKey="averagePrice"
            name="Average"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="medianPrice"
            name="Median"
            stroke="#22c55e"
            dot={false}
            strokeWidth={2}
          />
          <Brush
            dataKey="bucket"
            height={24}
            travellerWidth={8}
            fill="hsl(var(--muted))"
            stroke="hsl(var(--border))"
            tickFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiscountActivityChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="bucket"
            minTickGap={28}
            tick={chartAxisTick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis width={64} tick={chartAxisTick} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelStyle={chartTooltipLabelStyle}
            itemStyle={chartTooltipItemStyle}
            cursor={chartCursorStyle}
          />
          <Legend wrapperStyle={chartLegendStyle} />
          <Bar dataKey="averageDiscount" name="Avg discount %" fill="#f97316" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceChangesChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
          <XAxis
            dataKey="bucket"
            minTickGap={28}
            tick={chartAxisTick}
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
          <Bar dataKey="drops" name="Drops" stackId="changes" fill="#22c55e" />
          <Bar dataKey="increases" name="Increases" stackId="changes" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
