'use client';

import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AvailabilityAnalytics } from '@/server/analytics/types';

export function AvailabilityAnalyticsPanel({ data }: { data: AvailabilityAnalytics }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_360px]">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="bucket" minTickGap={28} />
            <YAxis width={52} />
            <Tooltip />
            <Legend />
            <Bar dataKey="inStock" stackId="stock" fill="#22c55e" />
            <Bar dataKey="outOfStock" stackId="stock" fill="#ef4444" />
            <Bar dataKey="unknown" stackId="stock" fill="#64748b" />
            <Bar dataKey="backInStock" fill="#14b8a6" />
            <Bar dataKey="newlyUnavailable" fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Legend />
            <Pie data={data.distribution} dataKey="value" nameKey="name" outerRadius={110} fill="#3b82f6" label />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
