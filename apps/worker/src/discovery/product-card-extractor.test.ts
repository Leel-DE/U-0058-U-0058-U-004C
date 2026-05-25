import { describe, expect, it } from 'vitest';
import { extractProductCards, extractProductCardsWithSelectors } from './product-card-extractor.js';

describe('extractProductCards', () => {
  it('extracts products from repeated cards', () => {
    const html = `
      <article class="product-card"><a href="/p1"><h2>Bike One</h2></a><span class="price">999,99 €</span><img src="/1.jpg" /></article>
      <article class="product-card"><a href="/p2"><h2>Bike Two</h2></a><span class="price">1.999,- €</span><img src="/2.jpg" /></article>
    `;
    const products = extractProductCards(html, 'https://x.test/c', 'Bikes');
    expect(products).toHaveLength(2);
    expect(products[0]?.title).toBe('Bike One');
    expect(products[0]?.price).toBe(999.99);
  });

  it('extracts fahrrad-xxl-style markup (data-product-id + .artikel class)', () => {
    // Real markup pattern from fahrrad-xxl.de category pages.
    const html = `
      <div class="fxxl-warengruppe-detail-default">
        <div id="article-758891" data-product-id="758891" data-variant-id="758891"
             class="fxxl-element-artikel fxxl-element-artikel--slider">
          <a href="/cube-acid/pedale-flat-a4-ib-hybrid">
            <img src="/img/758891.jpg" alt="Pedale FLAT A4-IB Hybrid" />
            <h3 class="fxxl-element-artikel__title">Pedale FLAT A4-IB Hybrid</h3>
          </a>
          <span class="fxxl-element-artikel__price">46,99 €</span>
        </div>
        <div id="article-461423" data-product-id="461423" data-variant-id="461423"
             class="fxxl-element-artikel fxxl-element-artikel--slider">
          <a href="/shimano/pd-eh500-spd-kombi-plattform-pedale">
            <img src="/img/461423.jpg" alt="PD-EH500 SPD" />
            <h3 class="fxxl-element-artikel__title">PD-EH500 SPD Kombi Plattform Pedale</h3>
          </a>
          <span class="fxxl-element-artikel__price">74,99 €</span>
        </div>
        <div id="article-758894" data-product-id="758894" data-variant-id="758894"
             class="fxxl-element-artikel">
          <a href="/cube-acid/pedale-flat-c1-ib">
            <img src="/img/758894.jpg" alt="Pedale FLAT C1-IB" />
            <h3 class="fxxl-element-artikel__title">Pedale FLAT C1-IB</h3>
          </a>
          <span class="fxxl-element-artikel__price">44,99 €</span>
        </div>
      </div>`;
    const products = extractProductCards(html, 'https://www.fahrrad-xxl.de/fahrradteile/pedale/');
    expect(products.length).toBeGreaterThanOrEqual(3);
    expect(products[0]?.url).toContain('fahrrad-xxl.de');
    expect(products[0]?.price).toBe(46.99);
    expect(products.map((p) => p.title)).toEqual(
      expect.arrayContaining([
        'Pedale FLAT A4-IB Hybrid',
        'PD-EH500 SPD Kombi Plattform Pedale',
        'Pedale FLAT C1-IB',
      ]),
    );
  });

  it('does NOT fuse two adjacent prices (sale + RRP) into one giant number', () => {
    // Reproduces the bug that produced "2199504399.00 EUR" on the products
    // listing — sale price + RRP printed in the same DOM text with no
    // explicit current/old selectors. The new extractor must:
    //   • return current = 2199.50  (the smaller)
    //   • return old     = 4399.00  (the larger)
    //   • never produce a 10-digit Frankenstein.
    const html = `
      <article class="product-card" data-product-id="42">
        <a href="/bike/hercules-nos-2-1"><h2>Hercules Nos 2.1</h2></a>
        <img src="/img/h.jpg" />
        <div class="product-price">
          <span>2.199,50 €</span>
          <span>4.399,00 €</span>
        </div>
      </article>
      <article class="product-card" data-product-id="43">
        <a href="/bike/another"><h2>Another</h2></a>
        <img src="/img/a.jpg" />
        <div class="product-price"><span>999,00 €</span></div>
      </article>`;
    const products = extractProductCards(html, 'https://x.test/c');
    expect(products[0]?.price).toBe(2199.5);
    expect(products[0]?.oldPrice).toBe(4399);
    expect(products[0]?.price).toBeLessThan(100_000);
    expect(products[1]?.price).toBe(999);
    expect(products[1]?.oldPrice).toBeUndefined();
  });

  it('does NOT mistake a model-year number for an old/current price', () => {
    // Bug reproducer: "Modeljahr 2026" + price "1.399,00 €" in the same card
    // used to be parsed as 20261399.00 (year glued to price) OR as old=2026.
    // pickCardSelector needs ≥2 matching cards.
    const html = `
      <article class="product-card" data-product-id="9">
        <a href="/cube-nuroad-ex-2026"><h2>Cube Nuroad EX 2026</h2></a>
        <img src="/img/n.jpg" />
        <span class="model-year">Modeljahr 2026</span>
        <span class="price">1.399,00 €</span>
      </article>
      <article class="product-card" data-product-id="10">
        <a href="/another"><h2>Another</h2></a>
        <img src="/img/a.jpg" />
        <span class="price">799,00 €</span>
      </article>`;
    const [p] = extractProductCards(html, 'https://x.test/c');
    expect(p?.price).toBe(1399);
    expect(p?.oldPrice).toBeUndefined();
  });

  it('caps clearly-implausible prices to undefined (no 9-digit bikes)', () => {
    const html = `
      <article class="product-card" data-product-id="1">
        <a href="/x"><h2>Bogus</h2></a>
        <img src="/img/x.jpg" />
        <span class="price">999999999,00 €</span>
      </article>
      <article class="product-card" data-product-id="2">
        <a href="/y"><h2>Real</h2></a>
        <img src="/img/y.jpg" />
        <span class="price">499,00 €</span>
      </article>`;
    const products = extractProductCards(html, 'https://x.test/c');
    expect(products[0]?.price).toBeUndefined();
    expect(products[1]?.price).toBe(499);
  });

  it('picks the lazy-load attribute instead of a 1×1 placeholder src', () => {
    const html = `
      <article class="product-card" data-product-id="1">
        <a href="/p"><h2>Lazy</h2></a>
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
             data-src="/cdn/lazy-real.jpg" />
        <span class="price">99,00 €</span>
      </article>
      <article class="product-card" data-product-id="2">
        <a href="/p2"><h2>Srcset</h2></a>
        <img srcset="/cdn/small.jpg 1x, /cdn/big.jpg 2x" />
        <span class="price">100,00 €</span>
      </article>`;
    const products = extractProductCards(html, 'https://x.test/c');
    expect(products[0]?.imageUrl).toBe('https://x.test/cdn/lazy-real.jpg');
    expect(products[1]?.imageUrl).toBe('https://x.test/cdn/small.jpg');
  });

  it('extracts Tilda popup products with UAH price ranges and popup links', () => {
    const starterTitle = '\u0421\u0442\u0430\u0440\u0442\u043e\u0432\u044b\u0439 \u043d\u0430\u0431\u043e\u0440';
    const proTitle =
      '\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u043d\u0430\u0431\u043e\u0440';
    const html = `
      <div class="t-popup" data-tooltip-hook="#popup:starterKit">
        <div class="t-popup__container js-product js-store-product js-store-product_single" data-product-gen-uid="1">
          <div class="t-slds__bgimg js-product-img" data-original="https://cdn.test/start.jpg"></div>
          <div class="js-product-name t750__title">${starterTitle}</div>
          <span class="js-product-sku">SKU-StarterKit-91001</span>
          <div class="js-store-prod-price">1699 - 1991 \u0433\u0440\u043d.</div>
          <div class="js-store-prod-price-old">2375 \u0433\u0440\u043d.</div>
        </div>
      </div>
      <div class="t-popup" data-tooltip-hook="#popup:proKit">
        <div class="t-popup__container js-product js-store-product js-store-product_single" data-product-gen-uid="2">
          <div class="t-slds__bgimg js-product-img" data-original="https://cdn.test/pro.jpg"></div>
          <div class="js-product-name t750__title">${proTitle}</div>
          <span class="js-product-sku">SKU-ProKit-91003</span>
          <div class="js-store-prod-price">2499 - 2799 \u0433\u0440\u043d.</div>
          <div class="js-store-prod-price-old">3500 \u0433\u0440\u043d.</div>
        </div>
      </div>`;

    const products = extractProductCards(html, 'https://olinbar.tools/');
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      title: starterTitle,
      url: 'https://olinbar.tools/#popup:starterKit',
      price: 1699,
      oldPrice: 2375,
      currency: 'UAH',
      imageUrl: 'https://cdn.test/start.jpg',
    });

    const selected = extractProductCardsWithSelectors(html, 'https://olinbar.tools/', {
      productCardSelector: '.js-product',
      cardTitleSelector: '.js-product-name',
      cardPriceSelector: '.js-store-prod-price',
      cardOldPriceSelector: '.js-store-prod-price-old',
      cardLinkSelector: '[data-tooltip-hook]',
      cardImageSelector: '.js-product-img',
      confidence: 0.8,
      notes: [],
    });
    expect(selected).toHaveLength(2);
    expect(selected[0]).toMatchObject({
      title: starterTitle,
      url: 'https://olinbar.tools/#popup:starterKit',
      price: 1699,
      oldPrice: 2375,
      currency: 'UAH',
      imageUrl: 'https://cdn.test/start.jpg',
    });
  });

  it('validates AI fallback selectors locally and ignores blocked links', () => {
    const html = `
      <div class="ai-card">
        <a class="ai-link" href="/products/valid-bike"><span class="ai-title">Valid Bike</span></a>
        <img class="ai-image" data-src="/valid.jpg" />
        <span class="ai-price">$999.00</span>
      </div>
      <div class="ai-card">
        <a class="ai-link" href="/cart"><span class="ai-title">Cart Link</span></a>
        <img class="ai-image" data-src="/cart.jpg" />
        <span class="ai-price">$1.00</span>
      </div>`;
    const products = extractProductCardsWithSelectors(html, 'https://x.test/c', {
      productCardSelector: '.ai-card',
      cardTitleSelector: '.ai-title',
      cardPriceSelector: '.ai-price',
      cardLinkSelector: '.ai-link',
      cardImageSelector: '.ai-image',
      confidence: 0.8,
      notes: [],
    });
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe('Valid Bike');
    expect(products[0]?.price).toBe(999);
  });

  it('does not throw when AI returns an invalid selector', () => {
    const products = extractProductCardsWithSelectors('<div></div>', 'https://x.test/c', {
      productCardSelector: '[',
      cardTitleSelector: '.title',
      cardPriceSelector: '.price',
      cardLinkSelector: 'a',
      cardImageSelector: 'img',
      confidence: 0.8,
      notes: ['invalid selector'],
    });
    expect(products).toEqual([]);
  });
});
