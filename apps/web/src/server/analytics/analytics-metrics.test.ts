import { describe, expect, it, vi } from 'vitest';
import {
  calculateAggressivenessScore,
  calculateCategoryVolatilityScore,
  calculateDataQualityScore,
  calculateDiscountPct,
  calculateFreshnessScore,
  calculateMedian,
} from './analytics-metrics';
import { parseAnalyticsFilters } from './analytics-filters';

describe('analytics metrics', () => {
  it('calculates average-supporting median values', () => {
    expect(calculateMedian([3, 1, 2])).toBe(2);
    expect(calculateMedian([10, 20, 30, 40])).toBe(25);
    expect(calculateMedian([])).toBeNull();
  });

  it('calculates analytics scores', () => {
    expect(calculateAggressivenessScore({ priceDrops: 4, discountedProducts: 3, priceChanges: 8, stockChanges: 2, failedScrapes: 1 })).toBeGreaterThan(50);
    expect(calculateCategoryVolatilityScore({ minPrice: 100, maxPrice: 140, avgPrice: 120, priceChangeCount: 3 })).toBeCloseTo(38.33, 1);
    expect(calculateDataQualityScore({ hasPrice: true, hasTitle: true, confidence: 0.9, recentChecked: true, extractionSuccess: true, validUrl: true })).toBeGreaterThan(95);
    expect(calculateFreshnessScore(100, 83)).toBe(83);
  });

  it('calculates discounts safely', () => {
    expect(calculateDiscountPct(80, 100)).toBe(20);
    expect(calculateDiscountPct(120, 100)).toBe(0);
    expect(calculateDiscountPct(null, 100)).toBe(0);
  });

  it('parses analytics filters and date windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    const filters = parseAnalyticsFilters({
      range: '7d',
      discountOnly: 'true',
      minPrice: '100',
      maxVolatility: '50',
      competitor: 'multicycle',
    });
    expect(filters.range).toBe('7d');
    expect(filters.discountOnly).toBe(true);
    expect(filters.minPrice).toBe(100);
    expect(filters.maxVolatility).toBe(50);
    expect(filters.competitor).toBe('multicycle');
    expect(filters.dateFrom?.toISOString()).toBe('2026-05-17T12:00:00.000Z');
    vi.useRealTimers();
  });
});
