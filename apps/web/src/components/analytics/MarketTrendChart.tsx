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
import type { MarketTrendPoint } from '@/server/analytics/types';

export function MarketTrendChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="bucket" minTickGap={28} />
          <YAxis width={72} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="averagePrice" name="Average" stroke="#3b82f6" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="medianPrice" name="Median" stroke="#22c55e" dot={false} strokeWidth={2} />
          <Brush dataKey="bucket" height={22} travellerWidth={8} />
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
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="bucket" minTickGap={28} />
          <YAxis width={64} />
          <Tooltip />
          <Legend />
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
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="bucket" minTickGap={28} />
          <YAxis width={52} />
          <Tooltip />
          <Legend />
          <Bar dataKey="drops" name="Drops" stackId="changes" fill="#22c55e" />
          <Bar dataKey="increases" name="Increases" stackId="changes" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
