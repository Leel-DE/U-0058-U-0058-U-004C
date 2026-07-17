import { existsSync } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

const WINDOWS_CHROME = [
  process.env.PROGRAMFILES
    ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
    : '',
  process.env['PROGRAMFILES(X86)']
    ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`
    : '',
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    : '',
].filter(Boolean);

export class BrowserLauncher {
  private browser: Browser | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const requestedMode = process.env.AUTOMATION_BROWSER_MODE ?? 'adaptive';
    const headed =
      requestedMode === 'headed' || (requestedMode === 'adaptive' && process.platform === 'win32');
    const executablePath =
      process.env.AUTOMATION_CHROME_PATH || WINDOWS_CHROME.find((path) => existsSync(path));
    const proxyServer = process.env.PLAYWRIGHT_PROXY_SERVER?.trim();
    if (proxyServer && !['http:', 'https:', 'socks5:'].includes(new URL(proxyServer).protocol)) {
      throw new Error('invalid_proxy_protocol');
    }
    const options: LaunchOptions = {
      headless: !headed,
      executablePath: executablePath || undefined,
      proxy: proxyServer
        ? {
            server: proxyServer,
            username: process.env.PLAYWRIGHT_PROXY_USERNAME,
            password: process.env.PLAYWRIGHT_PROXY_PASSWORD,
          }
        : undefined,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        ...(headed ? ['--start-minimized', '--window-position=-32000,-32000'] : []),
      ],
    };
    this.browser = await chromium.launch(options);
    return this.browser;
  }

  async close() {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }

  status() {
    return {
      connected: Boolean(this.browser?.isConnected()),
      mode: process.env.AUTOMATION_BROWSER_MODE ?? 'adaptive',
    };
  }
}
