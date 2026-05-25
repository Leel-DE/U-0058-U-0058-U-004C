import { describe, expect, it } from 'vitest';
import { classifyDiscoveryPage } from './page-classifier.js';

describe('classifyDiscoveryPage', () => {
  it('detects product and category pages', () => {
    expect(
      classifyDiscoveryPage(
        'https://x.test/product/a',
        '<script type="application/ld+json">{"@type":"Product"}</script>',
      ).pageType,
    ).toBe('product');
    expect(
      classifyDiscoveryPage(
        'https://x.test/e-bikes',
        '<article class="product-card"></article><article class="product-card"></article><article class="product-card"></article><a rel="next"></a>',
      ).pageType,
    ).toBe('category');
  });

  it('does NOT classify a real category page with GDPR footer as captcha', () => {
    const html = `
      <html><head><title>E-Bikes | Fahrrad XXL</title></head><body>
        <main>
          <article class="product-tile"><a href="/p1">P1</a><span class="price">€999</span></article>
          <article class="product-tile"><a href="/p2">P2</a><span class="price">€1199</span></article>
          <article class="product-tile"><a href="/p3">P3</a><span class="price">€1399</span></article>
          <nav aria-label="pagination"><a rel="next" href="?page=2">2</a></nav>
        </main>
        <footer>
          <p>Diese Seite ist durch reCAPTCHA und die Google
             Datenschutzerklärung geschützt.</p>
          <p>Captcha-Probleme? Kontaktieren Sie unseren Support.</p>
        </footer>
      </body></html>`;
    const result = classifyDiscoveryPage('https://www.fahrrad-xxl.de/e-bikes/', html);
    expect(result.pageType).not.toBe('captcha');
    expect(result.pageType).toBe('category');
  });

  it('does classify an actual Cloudflare challenge as captcha', () => {
    const html = `<html><head><title>Just a moment...</title></head>
      <body><div id="cf-wrapper">checking…</div>
      <script>window._cf_chl_opt = {};</script></body></html>`;
    expect(classifyDiscoveryPage('https://x.test/', html).pageType).toBe('captcha');
  });

  it('does classify a g-recaptcha gated page as captcha', () => {
    const html = `<html><body>
      <form><div class="g-recaptcha" data-sitekey="abc"></div></form>
    </body></html>`;
    expect(classifyDiscoveryPage('https://x.test/login', html).pageType).toBe('captcha');
  });

  it('does classify security verification interstitials as captcha', () => {
    const html = `<html><head><title>www.fahrrad24.de</title></head><body>
      <h1>www.fahrrad24.de</h1>
      <h2>Performing security verification</h2>
      <p>This website uses a security service to protect against malicious bots.</p>
      <p>This page is displayed while the website verifies you are not a bot.</p>
    </body></html>`;
    expect(classifyDiscoveryPage('https://www.fahrrad24.de/', html).pageType).toBe('captcha');
  });
});
