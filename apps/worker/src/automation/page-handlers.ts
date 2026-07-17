import type { Locator, Page } from 'playwright';
import type { PagePreparationResult } from './types.js';

const CAPTCHA_MARKERS = [
  'captcha',
  'cf-chl-captcha',
  'hcaptcha',
  'g-recaptcha',
  'verify you are human',
  'security verification',
  'challenge-platform',
];

async function firstVisible(locators: Locator[]) {
  for (const locator of locators) {
    if (
      await locator
        .first()
        .isVisible()
        .catch(() => false)
    )
      return locator.first();
  }
  return null;
}

export class CookieBannerHandler {
  async accept(page: Page) {
    const button = await firstVisible([
      page.getByRole('button', { name: /accept all|accept cookies|consent|allow all|agree/i }),
      page.getByRole('button', { name: /принять|разрешить|согласен/i }),
      page
        .locator('[id*="cookie" i] button, [class*="cookie" i] button')
        .filter({ hasText: /accept|consent|agree|ok/i }),
    ]);
    if (!button) return false;
    await button.click({ timeout: 2_500 }).catch(() => undefined);
    return true;
  }
}

export class PopupHandler {
  async dismiss(page: Page) {
    const dismissed: string[] = [];
    const candidates = [
      page.getByRole('button', { name: /close|dismiss|not now|skip|got it/i }),
      page.getByRole('button', { name: /закрыть|пропустить|не сейчас|понятно/i }),
      page.locator(
        '[role="dialog"] button[aria-label*="close" i], [role="dialog"] [class*="close" i]',
      ),
      page.locator('.modal button.close, [class*="onboarding" i] [class*="close" i]'),
    ];
    for (const candidate of candidates) {
      const button = candidate.first();
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click({ timeout: 2_000 }).catch(() => undefined);
      dismissed.push('popup');
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    return dismissed;
  }
}

export class CaptchaHandler {
  async detect(page: Page) {
    const url = page.url().toLowerCase();
    if (CAPTCHA_MARKERS.some((marker) => url.includes(marker)))
      return { detected: true, kind: 'challenge_url' };
    const marker = await page
      .locator(
        CAPTCHA_MARKERS.map((value) => `[id*="${value}" i], [class*="${value}" i]`).join(','),
      )
      .first()
      .isVisible()
      .catch(() => false);
    if (marker) return { detected: true, kind: 'captcha_widget' };
    const text = (
      await page
        .locator('body')
        .innerText({ timeout: 2_000 })
        .catch(() => '')
    ).toLowerCase();
    const found = CAPTCHA_MARKERS.find((value) => text.includes(value));
    return { detected: Boolean(found), kind: found ? 'challenge_text' : undefined };
  }
}

export class PagePreparationService {
  constructor(
    private readonly cookies = new CookieBannerHandler(),
    private readonly popups = new PopupHandler(),
    private readonly captcha = new CaptchaHandler(),
  ) {}

  async prepare(page: Page): Promise<PagePreparationResult> {
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    const dismissed: string[] = [];
    if (await this.cookies.accept(page)) dismissed.push('cookie_banner');
    dismissed.push(...(await this.popups.dismiss(page)));
    const challenge = await this.captcha.detect(page);
    return { captchaDetected: challenge.detected, captchaKind: challenge.kind, dismissed };
  }
}
