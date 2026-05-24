import type { FetchResult } from '../types.js';

export async function fetchHtml(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<FetchResult> {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'accept-language': 'en-US,en;q=0.5',
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  const html = await res.text();
  return {
    status: res.status,
    html,
    finalUrl: res.url,
    durationMs: Date.now() - t0,
    strategy: 'cheerio',
  };
}
