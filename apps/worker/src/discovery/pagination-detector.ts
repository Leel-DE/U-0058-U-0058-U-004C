import * as cheerio from 'cheerio';
import { normalizeUrl } from './url-normalizer.js';

export function detectPaginationUrls(html: string, pageUrl: string, limit = 20): string[] {
  const $ = cheerio.load(html);
  const rootUrl = new URL(pageUrl).origin;
  const urls = new Set<string>();
  const candidates = [
    $('a[rel="next"]').attr('href'),
    ...$('a[href]')
      .toArray()
      .filter((el) => {
        const label = $(el).text().replace(/\s+/g, ' ').trim();
        const href = $(el).attr('href') ?? '';
        return /next|weiter|nächste|seite|\d+/i.test(label) || /[?&](?:page|p|seite)=\d+/i.test(href);
      })
      .map((el) => $(el).attr('href')),
  ];
  for (const href of candidates) {
    const normalized = normalizeUrl(href, { rootUrl, baseUrl: pageUrl });
    if (normalized && normalized !== pageUrl) urls.add(normalized);
    if (urls.size >= limit) break;
  }
  return [...urls];
}

