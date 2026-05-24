'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProductDetailPoint, ProductSpreadPoint, ProductSparkPoint } from '@/server/products/types';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#e11d48', '#a855f7', '#14b8a6', '#f59e0b', '#64748b'];

export function ProductSparkline({ data }: { data: ProductSparkPoint[] }) {
  if (data.length < 2) return <div className="h-8 text-xs text-muted-foreground">no trend</div>;
  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductPriceTimeline({ data }: { data: ProductDetailPoint[] }) {
  const chartData = buildMultiLineData(data);
  const competitors = Array.from(new Set(data.map((point) => point.competitorName))).slice(0, 8);
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="date" minTickGap={28} />
          <YAxis width={72} />
          <Tooltip />
          <Legend />
          {competitors.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[index % COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          <Brush dataKey="date" height={22} travellerWidth={8} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductSpreadChart({ data }: { data: ProductSpreadPoint[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="date" minTickGap={28} />
          <YAxis width={72} />
          <Tooltip />
          <Area type="monotone" dataKey="max" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} />
          <Area type="monotone" dataKey="avg" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} />
          <Area type="monotone" dataKey="min" stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiscountTimeline({ data }: { data: ProductDetailPoint[] }) {
  const byDate = new Map<string, number>();
  for (const point of data) {
    if (point.discountPct == null) continue;
    const key = point.date.slice(0, 10);
    byDate.set(key, Math.max(byDate.get(key) ?? 0, point.discountPct));
  }
  const rows = Array.from(byDate.entries()).map(([date, discount]) => ({ date, discount: Number(discount.toFixed(1)) }));
  if (rows.length === 0) return <EmptyChart label="No historical discounts captured" />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="date" minTickGap={28} />
          <YAxis width={52} />
          <Tooltip />
          <Bar dataKey="discount" fill="#f97316" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AvailabilityTimeline({ data }: { data: ProductDetailPoint[] }) {
  const rows = buildAvailabilityRows(data);
  if (rows.length === 0) return <EmptyChart label="No availability history captured" />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="date" minTickGap={28} />
          <YAxis width={52} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inStock" stackId="stock" fill="#22c55e" />
          <Bar dataKey="outOfStock" stackId="stock" fill="#ef4444" />
          <Bar dataKey="unknown" stackId="stock" fill="#64748b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompetitorActivityHeatmap({ data }: { data: ProductDetailPoint[] }) {
  const rows = buildActivityRows(data);
  if (rows.length === 0) return <EmptyChart label="No activity history captured" />;
  return (
    <div className="grid gap-2">
      {rows.slice(0, 10).map((row) => (
        <div key={row.name} className="grid grid-cols-[160px_1fr] items-center gap-3 text-xs">
          <div className="truncate text-muted-foreground">{row.name}</div>
          <div className="flex gap-1">
            {row.cells.map((value, index) => (
              <span
                key={`${row.name}-${index}`}
                className="h-5 flex-1 rounded-sm"
                style={{ backgroundColor: activityColor(value) }}
                title={`${value} changes`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CheapestRotationChart({ data }: { data: ProductDetailPoint[] }) {
  const rows = buildCheapestRows(data);
  if (rows.length === 0) return <EmptyChart label="No cheapest-seller rotation yet" />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="name" />
          <YAxis width={52} />
          <Tooltip />
          <Bar dataKey="days">
            {rows.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{label}</div>;
}

function buildMultiLineData(data: ProductDetailPoint[]) {
  const map = new Map<string, Record<string, string | number | null>>();
  for (const point of data) {
    const date = point.date.slice(0, 10);
    const row = map.get(date) ?? { date };
    row[point.competitorName] = point.price;
    map.set(date, row);
  }
  return Array.from(map.values());
}

function buildAvailabilityRows(data: ProductDetailPoint[]) {
  const map = new Map<string, { date: string; inStock: number; outOfStock: number; unknown: number }>();
  for (const point of data) {
    const date = point.date.slice(0, 10);
    const row = map.get(date) ?? { date, inStock: 0, outOfStock: 0, unknown: 0 };
    if (point.availability === 'in_stock') row.inStock += 1;
    else if (point.availability === 'out_of_stock') row.outOfStock += 1;
    else row.unknown += 1;
    map.set(date, row);
  }
  return Array.from(map.values());
}

function buildActivityRows(data: ProductDetailPoint[]) {
  const buckets = Array.from(new Set(data.map((point) => point.date.slice(0, 10)))).slice(-14);
  const names = Array.from(new Set(data.map((point) => point.competitorName)));
  return names.map((name) => ({
    name,
    cells: buckets.map((bucket) => data.filter((point) => point.competitorName === name && point.date.startsWith(bucket)).length),
  }));
}

function buildCheapestRows(data: ProductDetailPoint[]) {
  const byDate = new Map<string, ProductDetailPoint[]>();
  for (const point of data) {
    if (point.price == null) continue;
    const key = point.date.slice(0, 10);
    const points = byDate.get(key) ?? [];
    points.push(point);
    byDate.set(key, points);
  }
  const wins = new Map<string, number>();
  for (const points of byDate.values()) {
    const cheapest = points.sort((a, b) => Number(a.price) - Number(b.price))[0];
    if (cheapest) wins.set(cheapest.competitorName, (wins.get(cheapest.competitorName) ?? 0) + 1);
  }
  return Array.from(wins.entries()).map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days);
}

function activityColor(value: number) {
  if (value === 0) return 'rgb(30 41 59)';
  if (value < 3) return 'rgb(59 130 246 / 0.45)';
  if (value < 6) return 'rgb(59 130 246 / 0.75)';
  return 'rgb(249 115 22 / 0.9)';
}
