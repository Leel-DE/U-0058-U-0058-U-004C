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

export interface BrowserFetchOptions {
  storageStateJson?: string;
  /** CSS selector for a container that should have at least 1 child once the
   *  JS-rendered listing is ready. Playwright waits up to `waitForChildrenMs`
   *  (default 8 s) for `document.querySelector(sel).children.length > 0`.
   *  Use this for Tilda/Shopify/InSales/Bitrix SPA shells. */
  waitForChildrenIn?: string;
  waitForChildrenMs?: number;
  /** Scroll to the bottom in a few steps to trigger lazy-loaded content
   *  (Tilda paginates with "load more" on scroll). Disabled by default. */
  scrollToBottom?: boolean;
}

export async function fetchHtmlBrowser(
  url: string,
  userAgent: string,
  timeoutMs: number,
  optsOrStorage?: BrowserFetchOptions | string,
): Promise<FetchResult> {
  const opts: BrowserFetchOptions =
    typeof optsOrStorage === 'string'
      ? { storageStateJson: optsOrStorage }
      : optsOrStorage ?? {};
  const t0 = Date.now();
  const ctx = opts.storageStateJson
    ? await chromium.launch({ headless: true }).then((b) =>
        b.newContext({
          userAgent,
          viewport: { width: 1366, height: 800 },
          locale: 'en-US',
          storageState: JSON.parse(opts.storageStateJson!) as never,
        }),
      )
    : await getContext(userAgent);
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
      .waitForLoadState('networkidle', { timeout: Math.min(8_000, timeoutMs / 2) })
      .catch(() => null);

    // SPA-list wait: stay on the page until the empty product-list container
    // we detected actually has children. This is the difference between
    // "Tilda DOM ready" and "Tilda AJAX has populated the list".
    if (opts.waitForChildrenIn) {
      const sel = opts.waitForChildrenIn;
      const waitMs = opts.waitForChildrenMs ?? 8_000;
      await page
        .waitForFunction(
          (s) => {
            const root = document.querySelector(s);
            return !!root && root.children.length > 0;
          },
          sel,
          { timeout: waitMs, polling: 250 },
        )
        .catch(() => null);
    }

    if (opts.scrollToBottom) {
      // Three small scroll steps with delays — triggers Tilda's
      // 'load more on scroll' without burning many CPU cycles.
      await page
        .evaluate(async () => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          for (let i = 0; i < 3; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(700);
          }
        })
        .catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
    }

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
    if (opts.storageStateJson) await ctx.browser()?.close().catch(() => null);
    openPages = Math.max(0, openPages - 1);
  }
}

export async function closePlaywright() {
  await context?.close().catch(() => null);
  await browser?.close().catch(() => null);
  context = null;
  browser = null;
}
