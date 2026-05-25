import { describe, expect, it } from 'vitest';
import { analyzeStoreFromPages } from './store-analyzer.js';

describe('analyzeStoreFromPages', () => {
  it('extracts store metadata, examples, selectors, and strategy from supplied pages', async () => {
    const homepage = `
      <html lang="de">
        <head>
          <title>OBI - Baumarkt</title>
          <meta property="og:site_name" content="OBI" />
        </head>
        <body>
          <a href="/category/tools">Tools</a>
          <a href="/product/drill-123456">Drill</a>
        </body>
      </html>`;
    const category = `
      <section>
        <article class="product-card" data-product-id="1">
          <a href="/product/drill-123456"><h2>Hammer Drill</h2></a>
          <img src="/drill.jpg" />
          <span class="price">EUR 99.90</span>
        </article>
        <article class="product-card" data-product-id="2">
          <a href="/product/saw-123457"><h2>Hand Saw</h2></a>
          <img src="/saw.jpg" />
          <span class="price">EUR 19.90</span>
        </article>
      </section>`;
    const product = `
      <main>
        <h1 class="product-title">Hammer Drill</h1>
        <span class="current-price">EUR 99.90</span>
        <span class="old-price">EUR 129.90</span>
        <img itemprop="image" src="/drill.jpg" />
      </main>`;

    const result = await analyzeStoreFromPages({
      homepageUrl: 'https://www.obi.de/',
      homepagePage: { url: 'https://www.obi.de/', html: homepage },
      categoryPage: { url: 'https://www.obi.de/category/tools', html: category },
      productPage: { url: 'https://www.obi.de/product/drill-123456', html: product },
      sitemapUrls: ['https://www.obi.de/sitemap.xml'],
      listingPageUrls: ['https://www.obi.de/category/tools'],
      productPageUrls: ['https://www.obi.de/product/drill-123456'],
      robotsStatus: 'allowed',
      useAi: false,
      respectRobots: true,
    });

    expect(result.store).toMatchObject({
      name: 'OBI',
      domain: 'obi.de',
      countryCode: 'DE',
      currency: 'EUR',
    });
    expect(result.examples.categoryPageUrl).toBe('https://www.obi.de/category/tools');
    expect(result.selectors.productSelectors.priceSelector).toBe('.current-price');
    expect(result.selectors.categorySelectors.productCardSelector).toContain('product-card');
    expect(result.previews.category?.cardCount).toBe(2);
    expect(result.scrapingMode).toBe('cheerio');
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
