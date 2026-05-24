import { describe, expect, it } from 'vitest';
import { detectSpaShell } from './spa-shell-detector.js';

describe('detectSpaShell', () => {
  it('flags an EMPTY Tilda t-store__card-list as SPA shell', () => {
    const html = `
      <html><head><script src="https://static.tildacdn.one/js/main.js"></script></head>
      <body>
        <div class="t-store t-store__filter-block">
          <div class="t-store__card-list"></div>
        </div>
      </body></html>`;
    const r = detectSpaShell(html);
    expect(r.likely).toBe(true);
    expect(r.reason).toBe('tilda_empty_list');
    expect(r.emptyContainerSelector).toContain('t-store__card-list');
  });

  it('does NOT flag a Tilda page that already has cards rendered server-side', () => {
    const html = `
      <html><body>
        <div class="t-store__card-list">
          <div class="js-product t-store__card" data-product-lid="1">card 1</div>
          <div class="js-product t-store__card" data-product-lid="2">card 2</div>
          <div class="js-product t-store__card" data-product-lid="3">card 3</div>
          <div class="js-product t-store__card" data-product-lid="4">card 4</div>
        </div>
      </body></html>`;
    expect(detectSpaShell(html).likely).toBe(false);
  });

  it('flags empty Shopify product-grid containers', () => {
    const html = `
      <html><body>
        <div data-section-type="product-grid"></div>
        <script src="//cdn.shopify.com/main.js"></script>
      </body></html>`;
    expect(detectSpaShell(html).reason).toBe('shopify_empty_list');
  });

  it('flags empty Bitrix catalog wrapper', () => {
    const html = `
      <html><body>
        <div id="catalog_section_wrapper"></div>
      </body></html>`;
    expect(detectSpaShell(html).reason).toBe('bitrix_empty_list');
  });

  it('flags a framework page with sparse body + huge HTML', () => {
    const padding = '<script>/* '.padEnd(60_000, 'x') + '*/</script>';
    const html = `
      <html><head>
        <script src="https://static.tildacdn.one/js/main.js"></script>
        ${padding}
      </head><body>Loading…</body></html>`;
    const r = detectSpaShell(html);
    expect(r.likely).toBe(true);
    expect(r.reason).toBe('tilda-cdn_sparse_body');
  });

  it('returns likely:false for plain HTML pages', () => {
    expect(detectSpaShell('<html><body><h1>Hi</h1><p>Normal page with content.</p></body></html>').likely).toBe(false);
  });

  it('returns likely:false for tiny / empty input', () => {
    expect(detectSpaShell('').likely).toBe(false);
    expect(detectSpaShell('<html></html>').likely).toBe(false);
  });
});
