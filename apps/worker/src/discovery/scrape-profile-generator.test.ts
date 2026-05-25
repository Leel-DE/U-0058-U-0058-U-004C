import { describe, expect, it } from 'vitest';
import { generateScrapeProfile } from './scrape-profile-generator.js';

describe('generateScrapeProfile', () => {
  it('recommends safe crawling for high anti-bot risk', () => {
    const profile = generateScrapeProfile({
      framework: { framework: 'custom', label: 'Custom', confidence: 0.5, signals: [] },
      rendering: {
        strategy: 'hybrid',
        scrapingMode: 'hybrid',
        hydration: 'partial',
        confidence: 0.8,
        signals: [],
        explanation: '',
      },
      robotsStatus: 'allowed',
      selectorConfidence: 0.7,
      warnings: ['captcha possible'],
      html: '<title>Just a moment...</title>',
    });
    expect(profile.antiBotRisk).toBe('high');
    expect(profile.crawlPreset).toBe('safe');
    expect(profile.recommendedDelaySeconds).toBeGreaterThanOrEqual(10);
  });

  it('keeps stable static shops balanced', () => {
    const profile = generateScrapeProfile({
      framework: { framework: 'custom', label: 'Custom', confidence: 0.5, signals: [] },
      rendering: {
        strategy: 'static_html',
        scrapingMode: 'cheerio',
        hydration: 'none',
        confidence: 0.8,
        signals: [],
        explanation: '',
      },
      robotsStatus: 'allowed',
      selectorConfidence: 0.9,
      warnings: [],
      html: '<h1>Shop</h1>',
    });
    expect(profile.crawlDifficulty).toBe('low');
    expect(profile.antiBotRisk).toBe('low');
    expect(profile.expectedScrapeStability).toBe('high');
  });
});
