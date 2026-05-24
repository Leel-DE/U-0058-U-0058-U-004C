import { describe, expect, it } from 'vitest';
import { cleanDom } from './clean-dom.js';

describe('cleanDom', () => {
  it('removes unsafe/noisy nodes and keeps stable attributes', () => {
    const cleaned = cleanDom(`
      <html><head><style>.x{}</style><script>secret()</script></head>
      <body>
        <!-- comment -->
        <h1 data-testid="title" onclick="x()" class="product-title">  Headphones   </h1>
        <svg><path /></svg>
        <img src="/a.jpg" width="200" />
      </body></html>
    `);

    expect(cleaned.html).toContain('data-testid="title"');
    expect(cleaned.html).toContain('class="product-title"');
    expect(cleaned.html).toContain('src="/a.jpg"');
    expect(cleaned.html).not.toContain('script');
    expect(cleaned.html).not.toContain('style');
    expect(cleaned.html).not.toContain('onclick');
    expect(cleaned.hash).toHaveLength(64);
  });
});

