/**
 * Integration tests for the new scoring-based product-card detector.
 * Each test fixes a real-world markup pattern (WooCommerce, Shopify,
 * Magento, Shopware, generic divs, German shops) and asserts the detector
 * returns the right cards with correct titles/prices/urls/images.
 */
import { describe, expect, it } from 'vitest';
import { detectProductCards } from './product-card-detector.js';

const URL = 'https://shop.example.com/category/x';

describe('detectProductCards', () => {
  it('detects WooCommerce LoopProduct cards', () => {
    const html = `
      <ul class="products columns-3">
        <li class="product woocommerce-LoopProduct">
          <a href="/product/bike-one" class="woocommerce-LoopProduct-link">
            <img src="/i/1.jpg" alt="Bike One" class="attachment-woocommerce_thumbnail" />
            <h2 class="woocommerce-loop-product__title">Bike One</h2>
            <span class="price"><span class="amount">€999,00</span></span>
          </a>
        </li>
        <li class="product woocommerce-LoopProduct">
          <a href="/product/bike-two" class="woocommerce-LoopProduct-link">
            <img src="/i/2.jpg" alt="Bike Two" />
            <h2 class="woocommerce-loop-product__title">Bike Two</h2>
            <span class="price"><span class="amount">€1.299,00</span></span>
          </a>
        </li>
        <li class="product woocommerce-LoopProduct">
          <a href="/product/bike-three" class="woocommerce-LoopProduct-link">
            <img src="/i/3.jpg" alt="Bike Three" />
            <h2 class="woocommerce-loop-product__title">Bike Three</h2>
            <span class="price"><span class="amount">€799,00</span></span>
          </a>
        </li>
      </ul>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
    expect(r.cards.every((c) => c.productUrl?.includes('/product/'))).toBe(true);
    expect(r.cards.map((c) => c.price).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([799, 999, 1299]);
  });

  it('detects Shopify-style product-grid cards (snake_case JSON-LD style)', () => {
    const html = `
      <div class="product-grid">
        <div class="product-card" data-product-id="111">
          <a href="/products/handle-a"><img data-src="/cdn/a.jpg" alt="A" /></a>
          <div class="product-card__title">Product A</div>
          <div class="product-card__price">$49.99</div>
        </div>
        <div class="product-card" data-product-id="222">
          <a href="/products/handle-b"><img data-src="/cdn/b.jpg" alt="B" /></a>
          <div class="product-card__title">Product B</div>
          <div class="product-card__price">$59.99</div>
        </div>
        <div class="product-card" data-product-id="333">
          <a href="/products/handle-c"><img data-src="/cdn/c.jpg" alt="C" /></a>
          <div class="product-card__title">Product C</div>
          <div class="product-card__price">$69.99</div>
        </div>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
    expect(r.cards.find((c) => c.title === 'Product B')?.price).toBe(59.99);
    expect(r.cards[0]?.imageUrl).toContain('/cdn/');
  });

  it('detects Shopware German "artikel" cards', () => {
    const html = `
      <div class="cms-listing-row">
        <div class="product-box card" data-product-information data-product-id="901">
          <a href="/detail/901"><img src="/m/1.jpg" alt="X" /></a>
          <a href="/detail/901" class="product-name">Cube Aim SLX 29 Zoll</a>
          <div class="product-price-info">
            <span class="product-price">799,00&nbsp;€</span>
            <span class="product-price-list">UVP 999,00&nbsp;€</span>
          </div>
        </div>
        <div class="product-box card" data-product-id="902">
          <a href="/detail/902"><img src="/m/2.jpg" alt="Y" /></a>
          <a href="/detail/902" class="product-name">Cube Nuroad EX 28 Zoll</a>
          <div class="product-price-info">
            <span class="product-price">1.399,00&nbsp;€</span>
          </div>
        </div>
        <div class="product-box card" data-product-id="903">
          <a href="/detail/903"><img src="/m/3.jpg" alt="Z" /></a>
          <a href="/detail/903" class="product-name">Cube Nulane Pro 28 Zoll</a>
          <div class="product-price-info">
            <span class="product-price">499,00&nbsp;€</span>
          </div>
        </div>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
    const cube = r.cards.find((c) => c.title?.includes('Cube Aim SLX'));
    expect(cube?.price).toBe(799);
    expect(cube?.currency).toBe('EUR');
    expect(cube?.productUrl).toContain('/detail/901');
  });

  it('detects Magento product-item cards via repeated structure', () => {
    const html = `
      <ol class="products list items product-items">
        <li class="item product product-item">
          <a class="product-item-link" href="/p1.html">Widget 1</a>
          <img class="product-image-photo" src="/img/p1.jpg" />
          <span class="price-wrapper"><span class="price">$19.99</span></span>
        </li>
        <li class="item product product-item">
          <a class="product-item-link" href="/p2.html">Widget 2</a>
          <img class="product-image-photo" src="/img/p2.jpg" />
          <span class="price-wrapper"><span class="price">$29.99</span></span>
        </li>
        <li class="item product product-item">
          <a class="product-item-link" href="/p3.html">Widget 3</a>
          <img class="product-image-photo" src="/img/p3.jpg" />
          <span class="price-wrapper"><span class="price">$39.99</span></span>
        </li>
      </ol>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
    expect(r.cards.map((c) => c.price).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([19.99, 29.99, 39.99]);
  });

  it('detects a generic non-class div-grid via scoring', () => {
    // No product-* classes; pure divs differentiated only by structure + signals.
    const html = `
      <main>
        <div>
          <div><a href="/items/a"><img src="/a.jpg" alt="A" /></a>
               <span>Mountain Bike A</span><span>€499,00</span></div>
          <div><a href="/items/b"><img src="/b.jpg" alt="B" /></a>
               <span>City Bike B</span><span>€599,00</span></div>
          <div><a href="/items/c"><img src="/c.jpg" alt="C" /></a>
               <span>Road Bike C</span><span>€699,00</span></div>
          <div><a href="/items/d"><img src="/d.jpg" alt="D" /></a>
               <span>Gravel Bike D</span><span>€799,00</span></div>
        </div>
      </main>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects nav/footer/cookie content even when it contains links and prices', () => {
    const html = `
      <header>
        <nav>
          <a href="/cart">Cart (3) — €120,00</a>
          <a href="/checkout">Checkout</a>
          <a href="/account">My account</a>
        </nav>
      </header>
      <footer>
        <a href="/cart">Warenkorb 120,00 €</a>
        <a href="/help">Help</a>
      </footer>
      <div class="cookie-banner">
        <a href="/privacy">Privacy 0,00 €</a>
      </div>
      <main>
        <div class="product-tile" data-product-id="1">
          <a href="/p/1"><img src="/1.jpg" alt="real" /></a>
          <h3>Real Product 1</h3>
          <span class="price">€100,00</span>
        </div>
        <div class="product-tile" data-product-id="2">
          <a href="/p/2"><img src="/2.jpg" alt="real" /></a>
          <h3>Real Product 2</h3>
          <span class="price">€200,00</span>
        </div>
        <div class="product-tile" data-product-id="3">
          <a href="/p/3"><img src="/3.jpg" alt="real" /></a>
          <h3>Real Product 3</h3>
          <span class="price">€300,00</span>
        </div>
      </main>`;
    const r = detectProductCards(html, { pageUrl: URL });
    const urls = r.cards.map((c) => c.productUrl ?? '');
    expect(urls.every((u) => !/\/(cart|checkout|account|help|privacy)/i.test(u))).toBe(true);
    expect(r.cards.length).toBeGreaterThanOrEqual(3);
  });

  it('deduplicates nested parent+child product candidates', () => {
    const html = `
      <div class="product-list">
        <div class="product-card" data-product-id="1">
          <article class="product-tile">
            <a href="/x"><img src="/x.jpg" alt="X" /></a>
            <h3>X</h3>
            <span class="price">€99,00</span>
          </article>
        </div>
        <div class="product-card" data-product-id="2">
          <article class="product-tile">
            <a href="/y"><img src="/y.jpg" alt="Y" /></a>
            <h3>Y</h3>
            <span class="price">€199,00</span>
          </article>
        </div>
        <div class="product-card" data-product-id="3">
          <article class="product-tile">
            <a href="/z"><img src="/z.jpg" alt="Z" /></a>
            <h3>Z</h3>
            <span class="price">€299,00</span>
          </article>
        </div>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    // 3 outer wrappers + 3 inner articles → expect exactly 3 unique cards
    expect(r.cards.length).toBe(3);
    expect(new Set(r.cards.map((c) => c.productUrl)).size).toBe(3);
  });

  it('extracts from JSON-LD ItemList', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context":"https://schema.org",
            "@type":"ItemList",
            "itemListElement":[
              {"@type":"ListItem","position":1,"item":{
                "@type":"Product","name":"Alpha","url":"https://shop.example.com/p/alpha",
                "image":"https://cdn/alpha.jpg",
                "offers":{"@type":"Offer","price":"199.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}},
              {"@type":"ListItem","position":2,"item":{
                "@type":"Product","name":"Bravo","url":"https://shop.example.com/p/bravo",
                "image":"https://cdn/bravo.jpg",
                "offers":{"@type":"Offer","price":"249.50","priceCurrency":"EUR"}}}
            ]
          }
        </script>
      </head><body></body></html>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.stats.structuredProducts).toBe(2);
    const alpha = r.cards.find((c) => c.title === 'Alpha');
    expect(alpha?.price).toBe(199);
    expect(alpha?.currency).toBe('EUR');
    expect(alpha?.source).toBe('json-ld');
  });

  it('extracts from __NEXT_DATA__ embedded payload', () => {
    const html = `
      <html><body>
        <div id="__next"></div>
        <script id="__NEXT_DATA__" type="application/json">{
          "props":{"pageProps":{"products":[
            {"id":1,"name":"Nx Bike","title":"Nx Bike","price":1299,"currency":"EUR","url":"/p/nx","image":"/nx.jpg"},
            {"id":2,"name":"Nx Bike 2","title":"Nx Bike 2","price":1499,"currency":"EUR","url":"/p/nx2","image":"/nx2.jpg"}
          ]}}
        }</script>
      </body></html>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.stats.payloadProducts).toBeGreaterThanOrEqual(2);
    expect(r.cards.some((c) => c.title === 'Nx Bike' && c.price === 1299)).toBe(true);
  });

  it('reads lazy image attributes (data-src) instead of placeholder src', () => {
    const html = `
      <div>
        <div class="product-card" data-product-id="1">
          <a href="/a"><img src="data:image/gif;base64,abc" data-src="/cdn/lazy-a.jpg" alt="A" /></a>
          <h3>Lazy A</h3>
          <span class="price">€10,00</span>
        </div>
        <div class="product-card" data-product-id="2">
          <a href="/b"><img src="data:image/gif;base64,abc" data-src="/cdn/lazy-b.jpg" alt="B" /></a>
          <h3>Lazy B</h3>
          <span class="price">€20,00</span>
        </div>
        <div class="product-card" data-product-id="3">
          <a href="/c"><img src="data:image/gif;base64,abc" data-src="/cdn/lazy-c.jpg" alt="C" /></a>
          <h3>Lazy C</h3>
          <span class="price">€30,00</span>
        </div>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.every((c) => c.imageUrl?.startsWith('https://') && c.imageUrl.includes('/cdn/lazy-'))).toBe(true);
  });

  it('ignores hidden duplicate template cards', () => {
    const html = `
      <div class="grid">
        <div style="display:none">
          <article class="product-card" data-product-id="template">
            <a href="/products/template"><img src="/template.jpg" alt="Template" /></a>
            <h3>Template Product</h3>
            <span class="price">$1.00</span>
          </article>
        </div>
        <article class="product-card" data-product-id="1">
          <a href="/products/a"><img src="/a.jpg" alt="A" /></a>
          <h3>Visible Product A</h3>
          <span class="price">$10.00</span>
        </article>
        <article class="product-card" data-product-id="2">
          <a href="/products/b"><img src="/b.jpg" alt="B" /></a>
          <h3>Visible Product B</h3>
          <span class="price">$20.00</span>
        </article>
        <article class="product-card" data-product-id="3">
          <a href="/products/c"><img src="/c.jpg" alt="C" /></a>
          <h3>Visible Product C</h3>
          <span class="price">$30.00</span>
        </article>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards).toHaveLength(3);
    expect(r.cards.some((card) => card.productUrl?.includes('template'))).toBe(false);
  });

  it('extracts SKU/EAN/GTIN from card attributes and microdata', () => {
    const html = `
      <div class="grid">
        <article class="product-card" data-product-id="1" data-sku="SKU-1" data-ean="4006381333931">
          <a href="/products/a"><img src="/a.jpg" alt="A" /></a>
          <h3>Identifier Product A</h3>
          <span itemprop="gtin13">4006381333931</span>
          <span class="price">$10.00</span>
        </article>
        <article class="product-card" data-product-id="2" data-sku="SKU-2">
          <a href="/products/b"><img src="/b.jpg" alt="B" /></a>
          <h3>Identifier Product B</h3>
          <span itemprop="gtin13">4006381333932</span>
          <span class="price">$20.00</span>
        </article>
        <article class="product-card" data-product-id="3" data-sku="SKU-3">
          <a href="/products/c"><img src="/c.jpg" alt="C" /></a>
          <h3>Identifier Product C</h3>
          <span itemprop="gtin13">4006381333933</span>
          <span class="price">$30.00</span>
        </article>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    const first = r.cards.find((card) => card.title === 'Identifier Product A');
    expect(first?.sku).toBe('SKU-1');
    expect(first?.ean).toBe('4006381333931');
    expect(first?.gtin).toBe('4006381333931');
  });

  it('returns a non-zero confidence and a card selector for repeating grids', () => {
    const html = `
      <div class="grid">
        ${Array.from({ length: 6 })
          .map(
            (_, i) => `
            <article class="product-card" data-product-id="${i}">
              <a href="/p/${i}"><img src="/i/${i}.jpg" alt="P${i}" /></a>
              <h3>Product ${i}</h3>
              <span class="price">€${100 + i},00</span>
            </article>`,
          )
          .join('\n')}
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    expect(r.cards.length).toBeGreaterThanOrEqual(6);
    expect(r.confidence).toBeGreaterThan(0.3);
    expect(r.cardSelector).toBeTruthy();
  });

  it('does NOT classify a single banner/ad with a price as a card', () => {
    const html = `
      <div class="promo-banner">
        <a href="/sale"><img src="/banner.jpg" alt="Banner" /></a>
        <p>Mega sale up to 50% off — from €99,00</p>
      </div>`;
    const r = detectProductCards(html, { pageUrl: URL });
    // No repeated grid + single weak candidate → either rejected or only one
    // weak card. Either way we should not return >=3 spurious cards.
    expect(r.cards.length).toBeLessThan(3);
  });

  it('returns an empty result on garbage input without throwing', () => {
    expect(() => detectProductCards('not really html', { pageUrl: URL })).not.toThrow();
    const r = detectProductCards('<html></html>', { pageUrl: URL });
    expect(r.cards).toEqual([]);
    expect(r.confidence).toBe(0);
  });
});
