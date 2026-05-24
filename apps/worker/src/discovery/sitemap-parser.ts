import * as cheerio from 'cheerio';
import { gunzipSync } from 'node:zlib';
import { normalizeUrl } from './url-normalizer.js';

export interface ParsedSitemap {
  urls: string[];
  sitemaps: string[];
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = $('url > loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const sitemaps = $('sitemap > loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  return { urls, sitemaps };
}

async function readResponseText(res: Response, url: string) {
  const bytes = Buffer.from(await res.arrayBuffer());
  if (/\.gz(?:$|\?)/i.test(url) || res.headers.get('content-encoding') === 'gzip') {
    return gunzipSync(bytes).toString('utf8');
  }
  return bytes.toString('utf8');
}

export async function loadSitemapUrls(rootUrl: string, userAgent: string, limit = 5000): Promise<{ urls: string[]; sitemaps: string[] }> {
  const root = new URL(rootUrl);
  const robotsUrl = `${root.origin}/robots.txt`;
  const seeds = new Set<string>([`${root.origin}/sitemap.xml`]);
  try {
    const robots = await fetch(robotsUrl, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(10_000) });
    if (robots.ok) {
      const text = await robots.text();
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*Sitemap:\s*(.+)\s*$/i);
        if (match?.[1]) seeds.add(match[1].trim());
      }
    }
  } catch {
    // robots sitemap discovery is opportunistic; crawl continues without it.
  }

  const urls = new Set<string>();
  const visitedSitemaps = new Set<string>();
  const queue = [...seeds];
  while (queue.length && urls.size < limit && visitedSitemaps.size < 100) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);
    try {
      const res = await fetch(sitemapUrl, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const parsed = parseSitemapXml(await readResponseText(res, sitemapUrl));
      for (const loc of parsed.urls) {
        const normalized = normalizeUrl(loc, { rootUrl, allowXml: false });
        if (normalized) urls.add(normalized);
        if (urls.size >= limit) break;
      }
      for (const loc of parsed.sitemaps) {
        const normalized = normalizeUrl(loc, { rootUrl, allowXml: true });
        if (normalized && !visitedSitemaps.has(normalized)) queue.push(normalized);
      }
    } catch {
      // Ignore broken sitemap branches.
    }
  }
  return { urls: [...urls], sitemaps: [...visitedSitemaps] };
}

