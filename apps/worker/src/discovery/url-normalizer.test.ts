import { describe, expect, it } from 'vitest';
import { isLikelyCategoryUrl, isLikelyProductUrl, normalizeUrl } from './url-normalizer.js';

describe('normalizeUrl', () => {
  it('normalizes relative URLs and removes tracking params', () => {
    expect(
      normalizeUrl('/shop/bikes/?utm_source=x&page=2&page=2#top', {
        rootUrl: 'https://example.com',
        baseUrl: 'https://example.com/start',
      }),
    ).toBe('https://example.com/shop/bikes?page=2');
  });

  it('rejects blocked paths, binary files, and external links', () => {
    expect(normalizeUrl('/cart', { rootUrl: 'https://example.com' })).toBeNull();
    expect(normalizeUrl('/manual.pdf', { rootUrl: 'https://example.com' })).toBeNull();
    expect(normalizeUrl('https://other.test/shop', { rootUrl: 'https://example.com' })).toBeNull();
  });

  it('classifies category and product urls', () => {
    expect(isLikelyCategoryUrl('https://example.com/e-bikes')).toBe(true);
    expect(isLikelyProductUrl('https://example.com/kettler-quadriga-comp-cx11-lg-750-m000063513')).toBe(true);
  });
});

