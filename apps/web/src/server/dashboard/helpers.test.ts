import { describe, expect, it, vi } from 'vitest';
import {
  calculateFreshness,
  calculatePctDelta,
  classifyAttentionIssue,
  classifyHealth,
  parseDashboardFilters,
} from './helpers';

describe('dashboard helpers', () => {
  it('calculates price deltas safely', () => {
    expect(calculatePctDelta(120, 100)).toBe(20);
    expect(calculatePctDelta(80, 100)).toBe(-20);
    expect(calculatePctDelta(0, 0)).toBe(0);
    expect(calculatePctDelta(5, 0)).toBe(100);
  });

  it('calculates freshness percentage', () => {
    expect(calculateFreshness(100, 87)).toBe(87);
    expect(calculateFreshness(0, 0)).toBe(0);
  });

  it('classifies health status', () => {
    expect(classifyHealth({ scrapingSuccessRate: 99, failedRuns24h: 0, brokenSelectorsCount: 0, manualSessionsCount: 0, staleProductsCount: 0 }).status).toBe('healthy');
    expect(classifyHealth({ scrapingSuccessRate: 80, failedRuns24h: 0, brokenSelectorsCount: 2, manualSessionsCount: 0, staleProductsCount: 0 }).status).toBe('warning');
    expect(classifyHealth({ scrapingSuccessRate: 40, failedRuns24h: 1, brokenSelectorsCount: 0, manualSessionsCount: 0, staleProductsCount: 0 }).status).toBe('critical');
  });

  it('classifies product attention issues by priority', () => {
    expect(classifyAttentionIssue({ selectorFailureCount: 1, price: 10 })).toBe('selector_broken');
    expect(classifyAttentionIssue({ snapshotStatus: 'captcha', price: 10 })).toBe('captcha_required');
    expect(classifyAttentionIssue({ price: null })).toBe('missing_price');
    expect(classifyAttentionIssue({ price: 80, previousPrice: 100, lastChecked: new Date() })).toBe('price_drop');
    expect(classifyAttentionIssue({ price: 120, previousPrice: 100, lastChecked: new Date() })).toBe('price_increase');
    expect(classifyAttentionIssue({ price: 100, previousPrice: 100, previousAvailability: 'out_of_stock', availability: 'in_stock', lastChecked: new Date() })).toBe('back_in_stock');
  });

  it('parses dashboard filters', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    const categoryId = '22222222-2222-4222-9222-222222222222';
    const filters = parseDashboardFilters({ range: '7d', activeOnly: 'false', failedOnly: 'true', category: categoryId });
    expect(filters.range).toBe('7d');
    expect(filters.categoryId).toBe(categoryId);
    expect(filters.activeOnly).toBe(false);
    expect(filters.failedOnly).toBe(true);
    vi.useRealTimers();
  });
});
