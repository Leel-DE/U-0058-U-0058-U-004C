import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import type { FetchResult } from '../types';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function getContext(userAgent: string): Promise<BrowserContext> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
  }
  if (!context) {
    context = await browser.newContext({
      userAgent,
      viewport: { width: 1366, height: 800 },
      locale: 'en-US',
    });
    // Block heavy resources by default
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') return route.abort();
      return route.continue();
    });
  }
  return context;
}

export async function fetchHtmlBrowser(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<FetchResult> {
  const t0 = Date.now();
  const ctx = await getContext(userAgent);
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const status = resp?.status() ?? 0;
    // small wait for client-side rendered prices to appear
    await page
      .waitForLoadState('networkidle', { timeout: Math.min(5_000, timeoutMs / 2) })
      .catch(() => null);
    const html = await page.content();
    return {
      status,
      html,
      finalUrl: page.url(),
      durationMs: Date.now() - t0,
      strategy: 'playwright',
    };
  } finally {
    await page.close().catch(() => null);
  }
}

export async function closePlaywright() {
  await context?.close().catch(() => null);
  await browser?.close().catch(() => null);
  context = null;
  browser = null;
}
