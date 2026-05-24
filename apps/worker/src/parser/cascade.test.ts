import { describe, it, expect } from 'vitest';
import { extract } from './cascade.js';
import type { ScrapingRules } from '../types.js';

const DEFAULT_RULES: ScrapingRules = {
  useJsonLd: true,
  useOpenGraph: true,
  titleSelector: 'h1',
  priceSelector: '.price',
  oldPriceSelector: null,
  availabilitySelector: '.stock',
  imageSelector: 'img.main',
  shippingSelector: null,
  ratingSelector: null,
  priceRegex: null,
};

const jsonLdHtml = `
  <html><head>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Acme HP-2000",
       "image":"https://cdn/x.jpg",
       "offers":{"@type":"Offer","price":"199.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
    </script>
  </head><body><h1>Acme HP-2000</h1></body></html>
`;

const ogHtml = `
  <html><head>
    <meta property="og:title" content="Widget"/>
    <meta property="product:price:amount" content="49.50"/>
    <meta property="product:price:currency" content="USD"/>
    <meta property="product:availability" content="instock"/>
  </head><body><h1>Widget</h1></body></html>
`;

const selectorHtml = `
  <html><body>
    <h1>Phone</h1>
    <span class="price">€ 599,00</span>
    <span class="stock">In stock</span>
    <img class="main" src="/p.jpg"/>
  </body></html>
`;

const noProductHtml = '<html><body><p>404</p></body></html>';

describe('extract cascade', () => {
  it('prefers JSON-LD when present', () => {
    const r = extract(jsonLdHtml, DEFAULT_RULES);
    expect(r?.sourcePath).toMatch(/json-ld|mixed/);
    expect(r?.price).toBe(199);
    expect(r?.currency).toBe('EUR');
    expect(r?.availability).toBe('in_stock');
  });
  it('falls back to OpenGraph', () => {
    const r = extract(ogHtml, { ...DEFAULT_RULES, useJsonLd: false });
    expect(r?.price).toBe(49.5);
    expect(r?.currency).toBe('USD');
  });
  it('falls back to CSS selectors', () => {
    const r = extract(selectorHtml, { ...DEFAULT_RULES, useJsonLd: false, useOpenGraph: false });
    expect(r?.price).toBe(599);
    expect(r?.currency).toBe('EUR');
    expect(r?.availability).toBe('in_stock');
  });
  it('returns null when nothing yields a price', () => {
    expect(extract(noProductHtml, DEFAULT_RULES)).toBeNull();
  });
  it('assigns confidence based on extracted fields', () => {
    const r = extract(jsonLdHtml, DEFAULT_RULES);
    expect(r?.confidence).toBeGreaterThan(0.7);
  });
});
