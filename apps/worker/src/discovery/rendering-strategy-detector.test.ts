import { describe, expect, it } from 'vitest';
import { detectRenderingStrategy } from './rendering-strategy-detector.js';
import type { FrameworkDetection } from './framework-detector.js';

const customFramework: FrameworkDetection = {
  framework: 'custom',
  label: 'Custom',
  confidence: 0.4,
  signals: [],
};

describe('detectRenderingStrategy', () => {
  it('detects static HTML when product cards are present without hydration', () => {
    const html = `
      <article class="product-card" data-product-id="1"><a href="/p/1"><h2>Bike One</h2></a><img src="/1.jpg" /><span class="price">EUR 999</span></article>
      <article class="product-card" data-product-id="2"><a href="/p/2"><h2>Bike Two</h2></a><img src="/2.jpg" /><span class="price">EUR 1199</span></article>
    `;
    const result = detectRenderingStrategy(html, 'https://shop.test/c', customFramework);
    expect(result.strategy).toBe('static_html');
    expect(result.scrapingMode).toBe('cheerio');
  });

  it('detects SPA shells', () => {
    const html = `
      <html><body><div id="__next"></div><div data-section-type="product-grid"></div></body>
      <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
      ${'<script></script>'.repeat(20)}
      </html>
    `.padEnd(60_000, ' ');
    const result = detectRenderingStrategy(html, 'https://shop.test/c', {
      framework: 'nextjs',
      label: 'Next.js',
      confidence: 0.8,
      signals: ['next_payload_or_assets'],
    });
    expect(result.strategy).toBe('spa');
    expect(result.scrapingMode).toBe('playwright_primary');
  });
});
