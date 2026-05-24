'use client';

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DataQualityAnalytics } from '@/server/analytics/types';

export function DataQualityPanel({ data }: { data: DataQualityAnalytics }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.confidenceDistribution}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="bucket" />
            <YAxis width={52} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.extractionHealthTrend}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="bucket" minTickGap={28} />
            <YAxis width={52} />
            <Tooltip />
            <Legend />
            <Bar dataKey="ok" stackId="health" fill="#22c55e" />
            <Bar dataKey="failed" stackId="health" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72 xl:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.scrapeSuccessTimeline}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="bucket" minTickGap={28} />
            <YAxis width={52} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="successRate" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
