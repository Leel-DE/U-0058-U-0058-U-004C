import { describe, expect, it } from 'vitest';
import { discountPct, stockStatus, volatilityScore } from './metrics';
import { normalizeProductTitle, productKey, titleSimilarity } from './normalization';
import { extractProductSpecs } from './spec-extractor';
import { scoreProductMatch } from './matching';

describe('products intelligence helpers', () => {
  it('normalizes product titles and keys', () => {
    expect(normalizeProductTitle('CUBE Stereo Hybrid ONE44 (2026)')).toBe('CUBE Stereo Hybrid ONE44 2026');
    expect(productKey('Stereo Hybrid ONE44 - E-MTB', 'CUBE')).toContain('cube');
  });

  it('calculates price analytics', () => {
    expect(discountPct(2499, 4299)).toBeCloseTo(41.87, 1);
    expect(volatilityScore(2000, 2600, 2300)).toBeCloseTo(26.1, 1);
    expect(stockStatus(2, 1, 0)).toBe('mixed');
  });

  it('extracts common e-bike specs from public title text', () => {
    const specs = extractProductSpecs('Kettler Quadriga Comp CX11 750 Wh 28 Zoll 2026 Bosch Performance CX', 'Kettler');
    expect(specs.brand).toBe('Kettler');
    expect(specs.batteryWh).toBe(750);
    expect(specs.wheelSize).toBe('28"');
    expect(specs.year).toBe(2026);
    expect(specs.motor).toBe('bosch performance cx');
  });

  it('scores exact and fuzzy product matches', () => {
    expect(scoreProductMatch({
      myTitle: 'CUBE Stereo Hybrid ONE44',
      competitorTitle: 'Cube Stereo Hybrid ONE44 Pro 800',
      myBrand: 'CUBE',
      competitorBrand: 'Cube',
    }).score).toBeGreaterThan(0.5);
    expect(scoreProductMatch({
      myTitle: 'Any product',
      competitorTitle: 'Different product',
      myGtin: '123',
      competitorGtin: '123',
    }).method).toBe('gtin');
    expect(titleSimilarity('CUBE Stereo Hybrid ONE44', 'Cube Stereo Hybrid ONE44 Pro')).toBeGreaterThan(0.6);
  });
});
