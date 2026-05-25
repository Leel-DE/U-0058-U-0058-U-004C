import { describe, it, expect } from 'vitest';
import { parsePrice, detectCurrency, detectAvailability, normalizeAvailability } from './normalize.js';

describe('parsePrice', () => {
  it('parses European format with comma decimal', () => {
    expect(parsePrice('€1.299,00')).toBe(1299);
    expect(parsePrice('€19,99')).toBe(19.99);
  });
  it('parses US format with dot decimal', () => {
    expect(parsePrice('$1,299.99')).toBe(1299.99);
    expect(parsePrice('19.99')).toBe(19.99);
  });
  it('parses plain integer prices and ranges', () => {
    expect(parsePrice('1699 - 1991 грн.')).toBe(1699);
    expect(parsePrice('2499 грн.')).toBe(2499);
  });
  it('returns undefined for non-numeric', () => {
    expect(parsePrice('out of stock')).toBeUndefined();
    expect(parsePrice('')).toBeUndefined();
    expect(parsePrice(null)).toBeUndefined();
  });
  it('uses custom regex when supplied', () => {
    expect(parsePrice('Price: 49.50 EUR', '(\\d+\\.\\d+)')).toBe(49.5);
  });
});

describe('detectCurrency', () => {
  it('detects from symbol', () => {
    expect(detectCurrency('€19,99')).toBe('EUR');
    expect(detectCurrency('$19.99')).toBe('USD');
    expect(detectCurrency('£19.99')).toBe('GBP');
  });
  it('detects from ISO code', () => {
    expect(detectCurrency('19.99 EUR')).toBe('EUR');
    expect(detectCurrency('USD 19.99')).toBe('USD');
    expect(detectCurrency('1699 грн.')).toBe('UAH');
  });
});

describe('detectAvailability', () => {
  it('classifies common phrasings', () => {
    expect(detectAvailability('In Stock')).toBe('in_stock');
    expect(detectAvailability('Out of stock')).toBe('out_of_stock');
    expect(detectAvailability('pre-order')).toBe('preorder');
    expect(detectAvailability('Only 2 left')).toBe('limited');
  });
});

describe('normalizeAvailability', () => {
  it('handles schema.org URI values', () => {
    expect(normalizeAvailability('https://schema.org/InStock')).toBe('in_stock');
    expect(normalizeAvailability('https://schema.org/OutOfStock')).toBe('out_of_stock');
    expect(normalizeAvailability('PreOrder')).toBe('preorder');
  });
});
