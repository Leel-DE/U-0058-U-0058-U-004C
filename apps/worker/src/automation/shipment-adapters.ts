import type { Page } from 'playwright';
import type { TrackingProviderAdapter } from './types.js';

async function waitForStableBody(page: Page) {
  let previous = '';
  let stable = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await page
      .locator('body')
      .innerText({ timeout: 2_000 })
      .catch(() => '');
    if (current.length > 250 && current === previous) stable += 1;
    else stable = 0;
    if (stable >= 2) return;
    previous = current;
    await page.waitForTimeout(500);
  }
}

abstract class TextTrackingAdapter implements TrackingProviderAdapter {
  abstract readonly id: TrackingProviderAdapter['id'];
  abstract readonly label: string;
  abstract buildUrl(trackingNumber: string): URL;

  async waitForResult(page: Page) {
    await waitForStableBody(page);
  }

  async extract(page: Page) {
    return page.locator('body').innerText({ timeout: 5_000 });
  }
}

export class UpsAdapter extends TextTrackingAdapter {
  readonly id = 'ups' as const;
  readonly label = 'UPS';
  buildUrl(value: string) {
    return new URL(`https://www.ups.com/track?tracknum=${encodeURIComponent(value)}`);
  }
}

export class PostalNinjaAdapter extends TextTrackingAdapter {
  readonly id = 'postal_ninja' as const;
  readonly label = 'Postal Ninja';
  buildUrl(value: string) {
    return new URL(`https://postal.ninja/en/track/${encodeURIComponent(value)}`);
  }
}

export class ParcelsAppAdapter extends TextTrackingAdapter {
  readonly id = 'parcelsapp' as const;
  readonly label = 'ParcelsApp';
  buildUrl(value: string) {
    return new URL(`https://parcelsapp.com/en/tracking/${encodeURIComponent(value)}`);
  }
}

export class Ship24Adapter extends TextTrackingAdapter {
  readonly id = 'ship24' as const;
  readonly label = 'Ship24';
  buildUrl(value: string) {
    return new URL(`https://www.ship24.com/tracking?p=${encodeURIComponent(value)}`);
  }
}

export class SeventeenTrackAdapter extends TextTrackingAdapter {
  readonly id = '17track' as const;
  readonly label = '17TRACK';
  buildUrl(value: string) {
    return new URL(`https://t.17track.net/en#nums=${encodeURIComponent(value)}`);
  }
}

export class YanwenAdapter extends TextTrackingAdapter {
  readonly id = 'yanwen' as const;
  readonly label = 'Yanwen';
  buildUrl(value: string) {
    return new URL(`https://track.yw56.com.cn/en-US?trackNumbers=${encodeURIComponent(value)}`);
  }
}

export const shipmentAdapters: TrackingProviderAdapter[] = [
  new UpsAdapter(),
  new PostalNinjaAdapter(),
  new ParcelsAppAdapter(),
  new Ship24Adapter(),
  new SeventeenTrackAdapter(),
  new YanwenAdapter(),
];
