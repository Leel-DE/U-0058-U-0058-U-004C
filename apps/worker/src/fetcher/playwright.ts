import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import type { FetchResult } from '../types.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let openPages = 0;

const MAX_PAGES = Math.max(1, Number(process.env.WORKER_BROWSER_MAX_PAGES ?? 2));

async function getContext(userAgent: string): Promise<BrowserContext> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking',
      ],
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
  while (openPages >= MAX_PAGES) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  openPages += 1;
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
    openPages = Math.max(0, openPages - 1);
  }
}

export async function closePlaywright() {
  await context?.close().catch(() => null);
  await browser?.close().catch(() => null);
  context = null;
  browser = null;
}
