import robotsParserModule from 'robots-parser';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
}
type RobotsParserFn = (url: string, robotstxt: string) => Robot;
const robotsParser = robotsParserModule as unknown as RobotsParserFn;

export async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return true;
    const parser = robotsParser(robotsUrl, await res.text());
    return parser.isAllowed(url, userAgent) !== false;
  } catch {
    return true;
  }
}
