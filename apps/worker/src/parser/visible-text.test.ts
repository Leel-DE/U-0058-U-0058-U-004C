import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { parseVisibleText } from './visible-text.js';

describe('parseVisibleText', () => {
  it('extracts product data from visible ecommerce text', () => {
    const $ = cheerio.load(`
      <main>
        <div>Fahrrad XXL</div>
        <h1>Kettler Quadriga Comp CX11 LG (750) - 750 Wh - 28 Zoll - Trapez</h1>
        <div>2.499,99 € <span>4.299,- €</span></div>
        <img src="https://example.test/product.jpg" alt="Kettler Quadriga" />
      </main>
    `);

    const data = parseVisibleText($);

    expect(data?.title).toContain('Kettler Quadriga');
    expect(data?.price).toBe(2499.99);
    expect(data?.oldPrice).toBe(4299);
    expect(data?.currency).toBe('EUR');
    expect(data?.image).toBe('https://example.test/product.jpg');
  });
});

