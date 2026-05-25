'use client';

import {
  Bar,
  BarChart,
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
import type { DataQualityAnalytics } from '@/server/analytics/types';

export function DataQualityPanel({ data }: { data: DataQualityAnalytics }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.confidenceDistribution}>
            <CartesianGrid stroke={chartGridStroke} strokeDasharray="3 3" opacity={0.55} />
            <XAxis dataKey="bucket" tick={chartAxisTick} tickLine={false} axisLine={false} />
            <YAxis width={52} tick={chartAxisTick} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              cursor={chartCursorStyle}
            />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.extractionHealthTrend}>
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
            <Bar dataKey="ok" stackId="health" fill="#22c55e" />
            <Bar dataKey="failed" stackId="health" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72 xl:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.scrapeSuccessTimeline}>
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
            <Line
              type="monotone"
              dataKey="successRate"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
            <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
