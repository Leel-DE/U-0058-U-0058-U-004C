'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompetitorAnalyticsRow } from '@/server/analytics/types';

export function CompetitorAggressivenessChart({ data }: { data: CompetitorAnalyticsRow[] }) {
  const rows = data.slice(0, 16).map((row) => ({
    name: row.competitorName,
    aggressiveness: row.aggressivenessScore,
    discount: row.avgDiscount,
    stockRatio: Math.round(row.stockRatio * 100),
  }));
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="name" interval={0} angle={-20} height={72} tick={{ fontSize: 11 }} />
          <YAxis width={52} />
          <Tooltip />
          <Legend />
          <Bar dataKey="aggressiveness" fill="#ef4444" />
          <Bar dataKey="discount" fill="#f97316" />
          <Bar dataKey="stockRatio" fill="#22c55e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
