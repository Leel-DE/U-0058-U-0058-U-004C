import { describe, it, expect } from 'vitest';
import { createStoreSchema, scrapingRulesSchema, testScrapeSchema } from './store';

describe('createStoreSchema', () => {
  it('strips protocol and path from domain', () => {
    const r = createStoreSchema.parse({
      name: 'Shop',
      domain: 'https://Shop.Example.com/some/path',
      countryCode: 'de',
      currency: 'EUR',
      crawlFrequencyMinutes: 1440,
      crawlDelaySeconds: 5,
      respectRobots: true,
      jsRequired: false,
    });
    expect(r.domain).toBe('shop.example.com');
    expect(r.countryCode).toBe('DE');
  });

  it('rejects invalid domain', () => {
    const r = createStoreSchema.safeParse({
      name: 'Shop',
      domain: 'not a domain',
      countryCode: 'de',
      currency: 'EUR',
      crawlFrequencyMinutes: 1440,
      crawlDelaySeconds: 5,
      respectRobots: true,
      jsRequired: false,
    });
    expect(r.success).toBe(false);
  });

  it('rejects crawl delay below minimum', () => {
    const r = createStoreSchema.safeParse({
      name: 'Shop',
      domain: 'shop.example.com',
      countryCode: 'DE',
      currency: 'EUR',
      crawlFrequencyMinutes: 1440,
      crawlDelaySeconds: 1,
      respectRobots: true,
      jsRequired: false,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unsupported currency', () => {
    const r = createStoreSchema.safeParse({
      name: 'Shop',
      domain: 'shop.example.com',
      countryCode: 'DE',
      currency: 'JPY',
      crawlFrequencyMinutes: 1440,
      crawlDelaySeconds: 5,
      respectRobots: true,
      jsRequired: false,
    });
    expect(r.success).toBe(false);
  });
});

describe('scrapingRulesSchema', () => {
  it('accepts minimal rules', () => {
    const r = scrapingRulesSchema.parse({
      storeId: '00000000-0000-4000-8000-000000000010',
      useJsonLd: true,
      useOpenGraph: true,
    });
    expect(r.useJsonLd).toBe(true);
  });
});

describe('testScrapeSchema', () => {
  it('rejects non-URLs', () => {
    const r = testScrapeSchema.safeParse({ storeId: '00000000-0000-4000-8000-000000000010', url: 'not-a-url' });
    expect(r.success).toBe(false);
  });
});
