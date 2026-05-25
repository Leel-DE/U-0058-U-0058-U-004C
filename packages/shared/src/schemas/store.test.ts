import { describe, it, expect } from 'vitest';
import { analyzeStoreSchema, createAnalyzedStoreSchema, createStoreSchema, scrapingRulesSchema, testScrapeSchema } from './store';

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

describe('store analysis schemas', () => {
  it('accepts homepage-only analysis input', () => {
    const r = analyzeStoreSchema.parse({ homepageUrl: 'https://www.obi.de/' });
    expect(r.useAi).toBe(false);
  });

  it('accepts analyzed store confirmation payload', () => {
    const r = createAnalyzedStoreSchema.parse({
      store: {
        name: 'OBI',
        domain: 'https://www.obi.de/',
        countryCode: 'de',
        currency: 'EUR',
        homepageUrl: 'https://www.obi.de/',
      },
      selectors: {
        productSelectors: { titleSelector: 'h1', priceSelector: '.price' },
        categorySelectors: { productCardSelector: '.product-card', cardPriceSelector: '.price' },
      },
      recommendedSettings: {
        crawlPreset: 'balanced',
        crawlFrequencyMinutes: 1440,
        crawlDelaySeconds: 5,
        respectRobots: true,
        jsRequired: false,
        useManualCaptcha: true,
        useAi: false,
        discoveryPreset: 'normal',
        discoveryDefaultsJson: { maxPages: 250 },
      },
      profile: {
        framework: 'shopware',
        renderingStrategy: 'hybrid',
        scrapeDifficulty: 'medium',
        antiBotRisk: 'low',
        recommendedMode: 'hybrid',
        detectionConfidence: 0.92,
        autoDetectedSettingsJson: {},
      },
    });
    expect(r.store.domain).toBe('www.obi.de');
    expect(r.store.countryCode).toBe('DE');
  });
});

describe('testScrapeSchema', () => {
  it('rejects non-URLs', () => {
    const r = testScrapeSchema.safeParse({ storeId: '00000000-0000-4000-8000-000000000010', url: 'not-a-url' });
    expect(r.success).toBe(false);
  });
});
