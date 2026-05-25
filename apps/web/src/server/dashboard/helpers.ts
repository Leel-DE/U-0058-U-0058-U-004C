import type { DashboardFilters, DashboardRange, HealthStatus, MonitoringHealth } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDashboardFilters(input: Record<string, string | string[] | undefined>): DashboardFilters {
  const range = normalizeRange(one(input.range));
  const now = new Date();
  const start = range === 'today' ? startOfDay(now) : new Date(now.getTime() - (range === '7d' ? 7 : 30) * DAY_MS);
  const periodMs = now.getTime() - start.getTime();
  return {
    range,
    competitorId: validUuid(one(input.competitor)) ? one(input.competitor) : undefined,
    categoryId: validUuid(one(input.category)) ? one(input.category) : undefined,
    activeOnly: one(input.activeOnly) !== 'false',
    failedOnly: one(input.failedOnly) === 'true',
    dateFrom: start.toISOString(),
    previousDateFrom: new Date(start.getTime() - periodMs).toISOString(),
    previousDateTo: start.toISOString(),
  };
}

export function calculatePctDelta(current: number, previous: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function calculateFreshness(total: number, fresh: number) {
  if (total <= 0) return 0;
  return Math.round((fresh / total) * 100);
}

export function classifyHealth(input: {
  scrapingSuccessRate: number;
  failedRuns24h: number;
  brokenSelectorsCount: number;
  manualSessionsCount: number;
  staleProductsCount: number;
}): { status: HealthStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (input.scrapingSuccessRate < 70) reasons.push('Low scraping success rate');
  if (input.failedRuns24h >= 5) reasons.push('Multiple failed runs in the last 24h');
  if (input.brokenSelectorsCount > 0) reasons.push('Broken selectors detected');
  if (input.manualSessionsCount > 0) reasons.push('Manual captcha sessions waiting');
  if (input.staleProductsCount >= 50) reasons.push('Many stale products');

  if (input.scrapingSuccessRate < 50 || input.failedRuns24h >= 10 || input.manualSessionsCount >= 3) {
    return { status: 'critical', reasons };
  }
  if (reasons.length > 0) return { status: 'warning', reasons };
  return { status: 'healthy', reasons: ['Monitoring is operating normally'] };
}

export function buildHealth(input: Omit<MonitoringHealth, 'status' | 'reasons'>): MonitoringHealth {
  const { status, reasons } = classifyHealth(input);
  return { ...input, status, reasons };
}

export function classifyAttentionIssue(input: {
  price?: number | null;
  previousPrice?: number | null;
  availability?: string | null;
  previousAvailability?: string | null;
  lastChecked?: Date | string | null;
  selectorFailureCount?: number;
  snapshotStatus?: string | null;
}): string | null {
  if ((input.selectorFailureCount ?? 0) > 0) return 'selector_broken';
  if (input.snapshotStatus && input.snapshotStatus !== 'ok') {
    return input.snapshotStatus === 'captcha' ? 'captcha_required' : 'extraction_failed';
  }
  if (input.price == null) return 'missing_price';
  if (isVeryOld(input.lastChecked, 24)) return 'stale_data';
  if (input.previousAvailability && input.availability && input.previousAvailability !== input.availability) {
    if (input.availability === 'out_of_stock') return 'out_of_stock';
    if (input.availability === 'in_stock') return 'back_in_stock';
  }
  if (input.price != null && input.previousPrice != null && input.previousPrice > 0) {
    const pct = ((input.price - input.previousPrice) / input.previousPrice) * 100;
    if (pct <= -5) return 'price_drop';
    if (pct >= 5) return 'price_increase';
  }
  return null;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRange(value: string | undefined): DashboardRange {
  return value === 'today' || value === '7d' || value === '30d' ? value : 'today';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function validUuid(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isVeryOld(value: Date | string | null | undefined, hours: number) {
  if (!value) return true;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000;
}
