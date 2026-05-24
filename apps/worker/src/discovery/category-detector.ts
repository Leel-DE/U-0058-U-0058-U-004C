import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { DiscoveryCategory } from './types.js';

export function extractBreadcrumbs($: cheerio.CheerioAPI): string[] {
  const crumbs = $('[itemtype*="BreadcrumbList"] [itemprop="name"], nav[aria-label*="breadcrumb" i] a, .breadcrumb a, .breadcrumbs a')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(crumbs)].slice(0, 10);
}

function pathFromUrl(url: string) {
  return new URL(url).pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/[-_]+/g, ' '))
    .join(' / ');
}

export function detectCategory(url: string, html: string, productsFound: number, paginationPagesFound: number): DiscoveryCategory {
  const $ = cheerio.load(html);
  const breadcrumbs = extractBreadcrumbs($);
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const name = h1 || breadcrumbs.at(-1) || pathFromUrl(url) || new URL(url).hostname;
  const estimateText = $('[class*="result" i], [class*="count" i], [data-testid*="count" i]')
    .first()
    .text()
    .replace(/\s+/g, ' ');
  const estimate = Number(estimateText.match(/\d{1,5}/)?.[0]);
  return {
    id: randomUUID(),
    url,
    name,
    path: breadcrumbs.length ? breadcrumbs.join(' / ') : pathFromUrl(url),
    breadcrumbs,
    productCountEstimate: Number.isFinite(estimate) ? estimate : undefined,
    productsFound,
    paginationPagesFound,
    confidence: productsFound > 0 ? 0.85 : 0.55,
    source: 'heuristic',
  };
}

