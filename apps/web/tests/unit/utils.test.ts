import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPct, cn, safeJson } from '@/lib/utils';

describe('formatCurrency', () => {
  it('formats with Intl', () => {
    expect(formatCurrency(199, 'EUR')).toMatch(/€199/);
    expect(formatCurrency('19.99', 'USD')).toMatch(/\$19\.99/);
  });
  it('returns em dash on null/undefined', () => {
    expect(formatCurrency(null, 'EUR')).toBe('—');
    expect(formatCurrency(undefined, 'USD')).toBe('—');
  });
  it('falls back when currency code invalid', () => {
    expect(formatCurrency(10, 'XXX')).toMatch(/10/);
  });
});

describe('formatPct', () => {
  it('adds sign and percent', () => {
    expect(formatPct(5)).toBe('+5.0%');
    expect(formatPct(-3.25, 2)).toBe('-3.25%');
  });
  it('returns dash on null', () => {
    expect(formatPct(null)).toBe('—');
  });
});

describe('cn', () => {
  it('merges class names and dedupes Tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', undefined, 'font-bold')).toContain('font-bold');
  });
});

describe('safeJson', () => {
  it('parses JSON strings', () => {
    expect(safeJson('{"a":1}', {})).toEqual({ a: 1 });
  });
  it('returns fallback on bad input', () => {
    expect(safeJson('not json', { x: 1 })).toEqual({ x: 1 });
  });
  it('passes through objects', () => {
    const obj = { y: 2 };
    expect(safeJson(obj, {})).toBe(obj);
  });
});
