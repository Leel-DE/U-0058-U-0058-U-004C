import { createHash } from 'node:crypto';
import type { Page } from 'playwright';

export class RetryManager {
  async run<T>(
    operation: () => Promise<T>,
    options: { attempts?: number; baseDelayMs?: number } = {},
  ) {
    const attempts = options.attempts ?? 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          const jitter = Math.floor(Math.random() * 250);
          await new Promise((resolve) =>
            setTimeout(resolve, (options.baseDelayMs ?? 750) * attempt + jitter),
          );
        }
      }
    }
    throw lastError;
  }
}

export class ScreenshotService {
  async capture(page: Page) {
    return page.screenshot({ type: 'jpeg', quality: 65, fullPage: false });
  }
}

export class SnapshotService {
  async sanitized(page: Page) {
    return page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('script, style, input, textarea, [contenteditable="true"]')
        .forEach((node) => node.remove());
      const html = clone.outerHTML
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
        .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
      return html.slice(0, 200_000);
    });
  }
}

export class ReportBuilder {
  eventHash(parts: Array<string | null | undefined>) {
    return createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex');
  }
}

export class GracefulShutdownManager {
  private handlers: Array<() => Promise<void>> = [];
  register(handler: () => Promise<void>) {
    this.handlers.push(handler);
  }
  async shutdown() {
    await Promise.allSettled(this.handlers.map((handler) => handler()));
  }
}
