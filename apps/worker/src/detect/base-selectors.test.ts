import { describe, expect, it, vi } from 'vitest';
import {
  detectBaseSelectorsFromPages,
  validateCategoryBaseSelectors,
  validateProductBaseSelectors,
} from './base-selectors.js';
import type { AIProvider } from '../ai/providers/index.js';

const pageUrl = 'https://shop.test/category';

describe('base selector detection', () => {
  it('detects selectors and preview values from a JSON-LD product page', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/og.jpg" />
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Product","name":"Acme Headphones","sku":"HP-1","brand":{"name":"Acme"},"image":"/json.jpg","offers":{"@type":"Offer","price":"189.90","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
          </script>
        </head>
        <body>
          <main>
            <nav aria-label="Breadcrumb"><a>Audio</a><a>Headphones</a></nav>
            <h1 itemprop="name">Acme Headphones</h1>
            <span itemprop="price">EUR 189.90</span>
            <link itemprop="availability" href="https://schema.org/InStock" />
            <img itemprop="image" src="/product.jpg" />
            <span itemprop="brand">Acme</span>
            <span itemprop="sku">HP-1</span>
          </main>
        </body>
      </html>`;

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://shop.test',
      productPage: { url: 'https://shop.test/products/hp-1', html },
      useAi: false,
    });

    expect(result.productSelectors.titleSelector).toBe('[itemprop="name"]');
    expect(result.productSelectors.priceSelector).toBe('[itemprop="price"]');
    expect(result.productSelectors.skuSelector).toBe('[itemprop="sku"]');
    expect(result.preview.product?.title).toBe('Acme Headphones');
    expect(result.preview.product?.price).toBe(189.9);
    expect(result.preview.product?.brand).toBe('Acme');
  });

  it('detects selectors from a generic product page', async () => {
    const html = `
      <main>
        <h1 class="product-title">Trail Bike 900</h1>
        <div class="product-price"><span class="current-price">EUR 1299.00</span><span class="old-price">EUR 1499.00</span></div>
        <p class="availability-status">In stock</p>
        <div class="product-image"><img src="/bike.jpg" /></div>
      </main>`;

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://shop.test',
      productPage: { url: 'https://shop.test/products/bike', html },
      useAi: false,
    });

    expect(result.productSelectors.titleSelector).toMatch(/h1|product-title/);
    expect(result.productSelectors.priceSelector).toBe('.current-price');
    expect(result.productSelectors.oldPriceSelector).toBe('.old-price');
    expect(result.preview.product?.image).toBe('https://shop.test/bike.jpg');
    expect(result.validation.product?.ok).toBe(true);
  });

  it('detects category cards, card fields, and pagination', async () => {
    const html = `
      <section class="grid">
        <article class="product-card" data-product-id="1">
          <a href="/p/one"><h2>Bike One</h2></a>
          <img src="/one.jpg" />
          <span class="price">EUR 999.00</span>
        </article>
        <article class="product-card" data-product-id="2">
          <a href="/p/two"><h2>Bike Two</h2></a>
          <img src="/two.jpg" />
          <span class="price">EUR 1199.00</span>
        </article>
      </section>
      <nav class="pagination"><a rel="next" href="/category?page=2">Next</a></nav>`;

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://shop.test',
      categoryPage: { url: pageUrl, html },
      useAi: false,
    });

    expect(result.categorySelectors.productCardSelector).toMatch(/product-card|data-product-id/);
    expect(result.categorySelectors.cardTitleSelector).toBe('h2');
    expect(result.categorySelectors.cardPriceSelector).toContain('price');
    expect(result.categorySelectors.paginationNextSelector).toBe('a[rel="next"]');
    expect(result.preview.category?.cardCount).toBe(2);
    expect(result.preview.category?.cards[0]?.link).toBe('https://shop.test/p/one');
  });

  it('detects German price selectors', async () => {
    const html = `
      <main>
        <h1 class="produkt-name">Cityrad Komfort</h1>
        <span class="produkt-preis">1.299,99 \u20ac</span>
        <span class="lieferstatus">Sofort verf\u00fcgbar</span>
      </main>`;

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://shop.test',
      productPage: { url: 'https://shop.test/produkt/cityrad', html },
      useAi: false,
    });

    expect(result.productSelectors.priceSelector).toBe('.produkt-preis');
    expect(result.preview.product?.price).toBe(1299.99);
    expect(result.preview.product?.availability).toBe('in_stock');
  });

  it('detects Tilda popup products with UAH prices', async () => {
    const html = `
      <div class="t-popup" data-tooltip-hook="#popup:starterKit">
        <div class="t-popup__container js-product js-store-product js-store-product_single" data-product-gen-uid="1">
          <div class="t-slds__bgimg js-product-img" data-original="https://cdn.test/start.jpg"></div>
          <div class="js-product-name t750__title">Стартовый набор</div>
          <span class="js-product-sku">SKU-StarterKit-91001</span>
          <div class="js-store-prod-price">1699 - 1991 грн.</div>
          <div class="js-store-prod-price-old">2375 грн.</div>
        </div>
      </div>
      <div class="t-popup" data-tooltip-hook="#popup:proKit">
        <div class="t-popup__container js-product js-store-product js-store-product_single" data-product-gen-uid="2">
          <div class="t-slds__bgimg js-product-img" data-original="https://cdn.test/pro.jpg"></div>
          <div class="js-product-name t750__title">Профессиональный набор</div>
          <span class="js-product-sku">SKU-ProKit-91003</span>
          <div class="js-store-prod-price">2499 - 2799 грн.</div>
          <div class="js-store-prod-price-old">3500 грн.</div>
        </div>
      </div>`;

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://olinbar.tools/',
      productPage: { url: 'https://olinbar.tools/#popup:starterKit', html },
      categoryPage: { url: 'https://olinbar.tools/', html },
      useAi: false,
    });

    expect(result.productSelectors.titleSelector).toBe('.js-product-name');
    expect(result.productSelectors.imageSelector).toBe('.js-product-img');
    expect(result.preview.product).toMatchObject({
      title: result.preview.category?.cards[0]?.title,
      price: 1699,
      oldPrice: 2375,
      currency: 'UAH',
      image: 'https://cdn.test/start.jpg',
    });
    expect(result.categorySelectors.productCardSelector).toMatch(/t-popup__container|js-store-product_single/);
    expect(result.categorySelectors.cardTitleSelector).toBe('.js-product-name');
    expect(result.categorySelectors.cardPriceSelector).toBe('.js-store-prod-price');
    expect(result.categorySelectors.cardLinkSelector).toBe('[data-tooltip-hook]');
    expect(result.preview.category?.cards[0]).toMatchObject({
      title: 'Стартовый набор',
      price: 1699,
      oldPrice: 2375,
      currency: 'UAH',
      image: 'https://cdn.test/start.jpg',
      link: 'https://olinbar.tools/#popup:starterKit',
    });
  });

  it('validates bad selectors locally', () => {
    const productValidation = validateProductBaseSelectors('<h1>Bike</h1>', 'https://shop.test/p', {
      titleSelector: '.missing',
      priceSelector: '.missing-price',
    });
    expect(productValidation.ok).toBe(false);
    expect(productValidation.fields.titleSelector?.valid).toBe(false);

    const categoryValidation = validateCategoryBaseSelectors('<div></div>', pageUrl, {
      productCardSelector: '.product-card',
      cardTitleSelector: 'h2',
    });
    expect(categoryValidation.ok).toBe(false);
    expect(categoryValidation.fields.productCardSelector?.valid).toBe(false);
  });

  it('uses mocked Gemini fallback only when heuristic confidence is low', async () => {
    const html = `
      <main>
        <div class="x-name">AI Bike</div>
        <div class="x-cost">EUR 999.00</div>
      </main>`;
    const provider: AIProvider = {
      detectProductSelectors: vi.fn(async () => ({
        titleSelector: '.x-name',
        priceSelector: '.x-cost',
        confidence: 0.82,
        notes: [],
      })),
      detectCategorySelectors: vi.fn(async () => ({
        productCardSelector: null,
        confidence: 0,
        notes: [],
      })),
      validateSelectors: vi.fn(async () => ({ valid: true, confidence: 1, problems: [] })),
      repairProductSelectors: vi.fn(async () => ({
        selectors: {},
        confidence: 0,
        reason: 'not used',
        warnings: [],
      })),
    };

    const result = await detectBaseSelectorsFromPages({
      homepageUrl: 'https://shop.test',
      productPage: { url: 'https://shop.test/products/ai-bike', html },
      useAi: true,
      aiProvider: provider,
    });

    expect(provider.detectProductSelectors).toHaveBeenCalledTimes(1);
    expect(result.productSelectors.titleSelector).toBe('.x-name');
    expect(result.productSelectors.priceSelector).toBe('.x-cost');
    expect(result.preview.product?.price).toBe(999);
    expect(result.logs.some((entry) => entry.message.includes('AI fallback'))).toBe(true);
  });
});
