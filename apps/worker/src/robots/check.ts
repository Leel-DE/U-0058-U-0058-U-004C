import robotsParserModule from 'robots-parser';
import { LRUCache } from 'lru-cache';

// robots-parser ships a typings file with `declare module 'robots-parser';`
// which shadows its real default-export. Re-narrow the type ourselves.
interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  isDisallowed(url: string, ua?: string): boolean | undefined;
}
type RobotsParserFn = (url: string, robotstxt: string) => Robot;
const robotsParser = robotsParserModule as unknown as RobotsParserFn;

const cache = new LRUCache<string, { parser: Robot; status: string }>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000,
});

interface CheckResult {
  allowed: boolean;
  status: string; // 'allowed' | 'disallowed' | 'no_robots' | 'fetch_error'
}

export async function checkRobots(url: string, userAgent: string): Promise<CheckResult> {
  const u = new URL(url);
  const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  const key = `${u.host}|${userAgent}`;

  let cached = cache.get(key);
  if (!cached) {
    try {
      const res = await fetch(robotsUrl, {
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 404) {
        cached = { parser: robotsParser(robotsUrl, ''), status: 'no_robots' };
      } else if (!res.ok) {
        cached = { parser: robotsParser(robotsUrl, ''), status: 'fetch_error' };
      } else {
        const body = await res.text();
        cached = { parser: robotsParser(robotsUrl, body), status: 'fetched' };
      }
    } catch {
      cached = { parser: robotsParser(robotsUrl, ''), status: 'fetch_error' };
    }
    cache.set(key, cached);
  }

  const allowed = cached.parser.isAllowed(url, userAgent) ?? true;
  return {
    allowed,
    status: cached.status === 'fetched' ? (allowed ? 'allowed' : 'disallowed') : cached.status,
  };
}
