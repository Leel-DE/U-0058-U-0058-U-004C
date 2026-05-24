import { describe, expect, it } from 'vitest';
import { parseSitemapXml } from './sitemap-parser.js';

describe('parseSitemapXml', () => {
  it('parses sitemap urls and sitemap indexes', () => {
    expect(parseSitemapXml('<urlset><url><loc>https://a.test/p</loc></url></urlset>').urls).toEqual(['https://a.test/p']);
    expect(parseSitemapXml('<sitemapindex><sitemap><loc>https://a.test/s.xml</loc></sitemap></sitemapindex>').sitemaps).toEqual(['https://a.test/s.xml']);
  });
});

