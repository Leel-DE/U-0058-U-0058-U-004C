import type { BrowserContext } from 'playwright';
import type { FetchResult } from '../types.js';
import { browserContextManager, browserLauncher } from '../automation/runtime-resources.js';
import { PagePreparationService } from '../automation/page-handlers.js';

let openPages = 0;
const MAX_PAGES = Math.max(1, Number(process.env.WORKER_BROWSER_MAX_PAGES ?? 2));
const preparation = new PagePreparationService();

export function browserPoolStats() {
  return {
    ...browserLauncher.status(),
    ...browserContextManager.status(),
    openPages,
    maxPages: MAX_PAGES,
  };
}

export async function playwrightHealth() {
  const startedAt = Date.now();
  await browserLauncher.getBrowser();
  return { ok: true, durationMs: Date.now() - startedAt, resources: browserPoolStats() };
}

export interface BrowserFetchOptions {
  storageStateJson?: string;
  waitForChildrenIn?: string;
  waitForChildrenMs?: number;
  scrollToBottom?: boolean;
}

async function acquireContext(
  userAgent: string,
  storageStateJson?: string,
): Promise<BrowserContext> {
  return browserContextManager.create({
    userAgent,
    storageState: storageStateJson ? JSON.parse(storageStateJson) : undefined,
  });
}

export async function fetchHtmlBrowser(
  url: string,
  userAgent: string,
  timeoutMs: number,
  optsOrStorage?: BrowserFetchOptions | string,
): Promise<FetchResult> {
  const opts =
    typeof optsOrStorage === 'string' ? { storageStateJson: optsOrStorage } : (optsOrStorage ?? {});
  const startedAt = Date.now();
  while (openPages >= MAX_PAGES) await new Promise((resolve) => setTimeout(resolve, 50));
  openPages += 1;
  const context = await acquireContext(userAgent, opts.storageStateJson);
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await preparation.prepare(page);
    if (opts.waitForChildrenIn) {
      await page
        .waitForFunction(
          (selector) => Boolean(document.querySelector(selector)?.children.length),
          opts.waitForChildrenIn,
          { timeout: opts.waitForChildrenMs ?? 8_000, polling: 250 },
        )
        .catch(() => undefined);
    }
    if (opts.scrollToBottom) {
      await page
        .evaluate(async () => {
          for (let step = 0; step < 3; step += 1) {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        })
        .catch(() => undefined);
    }
    const html = await page.content();
    const screenshotBase64 = await page
      .screenshot({ type: 'jpeg', quality: 60 })
      .then((value) => value.toString('base64'))
      .catch(() => undefined);
    return {
      status: response?.status() ?? 0,
      html,
      screenshotBase64,
      finalUrl: page.url(),
      durationMs: Date.now() - startedAt,
      strategy: 'playwright',
    };
  } finally {
    await page.close().catch(() => undefined);
    await browserContextManager.close(context);
    openPages = Math.max(0, openPages - 1);
  }
}

export async function closePlaywright() {
  await browserContextManager.closeAll();
  await browserLauncher.close();
}
