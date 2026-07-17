import type { BrowserContext, BrowserContextOptions } from 'playwright';
import { BrowserLauncher } from './browser-launcher.js';

export class BrowserContextManager {
  private active = new Set<BrowserContext>();

  constructor(private readonly launcher: BrowserLauncher) {}

  async create(
    options: {
      userAgent?: string;
      locale?: string;
      allowHeavyResources?: boolean;
      storageState?: BrowserContextOptions['storageState'];
    } = {},
  ) {
    const browser = await this.launcher.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: options.locale ?? 'en-US',
      userAgent: options.userAgent,
      timezoneId: 'Europe/Berlin',
      storageState: options.storageState,
    });
    if (!options.allowHeavyResources) {
      await context.route('**/*', async (route) => {
        const type = route.request().resourceType();
        if (type === 'media' || type === 'font') return route.abort();
        return route.continue();
      });
    }
    this.active.add(context);
    context.on('close', () => this.active.delete(context));
    return context;
  }

  async close(context: BrowserContext) {
    await context.close().catch(() => undefined);
    this.active.delete(context);
  }

  async closeAll() {
    await Promise.all([...this.active].map((context) => context.close().catch(() => undefined)));
    this.active.clear();
  }

  status() {
    return { activeContexts: this.active.size };
  }
}
