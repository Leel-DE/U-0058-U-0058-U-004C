'use client';

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketTrendPoint } from '@/server/analytics/types';

export function PriceBandChart({ data }: { data: MarketTrendPoint[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="bucket" minTickGap={28} />
          <YAxis width={72} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="maxPrice" name="Max" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} />
          <Area type="monotone" dataKey="averagePrice" name="Avg" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} />
          <Area type="monotone" dataKey="minPrice" name="Min" stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
