import type { AnalyticsFilters } from './types';

export interface RollupWindow {
  bucket: 'hour' | 'day' | 'month';
  maxPoints: number;
}

export function resolveRollupWindow(filters: AnalyticsFilters): RollupWindow {
  if (filters.range === '24h') return { bucket: 'hour', maxPoints: 24 };
  if (filters.range === '7d') return { bucket: 'day', maxPoints: 7 };
  if (filters.range === '30d') return { bucket: 'day', maxPoints: 30 };
  if (filters.range === '90d') return { bucket: 'day', maxPoints: 90 };
  return { bucket: 'month', maxPoints: 60 };
}

export function downsample<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  return rows.filter((_, index) => index % step === 0).slice(0, maxPoints);
}
