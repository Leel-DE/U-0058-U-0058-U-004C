// Capture a browser-storage snapshot (cookies + localStorage + sessionStorage)
// from YOUR OWN running Chrome via its remote debugging port, and write it to a
// JSON file that the shipment tracking worker hydrates into every parse.
//
// Why: public parcel-tracking sites gate results behind consent walls, logins
// and anti-bot clearance cookies. Replaying your real browser session gives the
// headless/headed worker the same access you have when you open those sites by
// hand.
//
// ─── How to use ──────────────────────────────────────────────────────────────
// 1. Fully close Chrome (so the profile is not locked).
// 2. Relaunch Chrome with the debugging port + your normal profile, e.g. on
//    Windows PowerShell:
//
//      & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
//        --remote-debugging-port=9222 `
//        --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data"
//
//    (Or use a dedicated --user-data-dir and log into the tracking sites there.)
// 3. Open the tracking sites you care about in tabs (postal.ninja, 17track,
//    parcelsapp, ship24, ups…) and pass any consent/login. localStorage and
//    sessionStorage are only readable for origins that have an open tab.
// 4. Run:  pnpm capture:browser-storage
// 5. Set TORQUECORE_BROWSER_STORAGE_STATE_PATH in .env.local to the printed path.
//
// The snapshot contains real session secrets — it is written under .cache/
// (git-ignored). Never commit it.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

const endpoint =
  readArg('--endpoint') || process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
const outPath = path.resolve(
  readArg('--out') ||
    process.env.TORQUECORE_BROWSER_STORAGE_STATE_PATH ||
    path.join(repoRoot, '.cache', 'browser-storage-snapshot.json'),
);

function isHydratableOrigin(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint);
  } catch (error) {
    console.error(
      `\nCould not connect to Chrome at ${endpoint}.\n` +
        `Start Chrome with --remote-debugging-port=9222 first (see the header of\n` +
        `this script for the exact command), then run this again.\n\n` +
        `Underlying error: ${error instanceof Error ? error.message : error}\n`,
    );
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('Connected to Chrome but found no browser context. Is a window open?');
    await browser.close();
    process.exit(1);
  }

  const cookies = [];
  const localStorageByOrigin = new Map(); // origin -> Map(name -> value)
  const sessionStorageByOrigin = new Map();
  let inspectedPages = 0;

  for (const context of contexts) {
    for (const cookie of await context.cookies().catch(() => [])) cookies.push(cookie);

    for (const page of context.pages()) {
      const pageUrl = page.url();
      if (!isHydratableOrigin(pageUrl)) continue;
      const origin = new URL(pageUrl).origin;
      inspectedPages += 1;
      const dump = await page
        .evaluate(() => {
          const read = (storage) => {
            const items = [];
            for (let i = 0; i < storage.length; i += 1) {
              const name = storage.key(i);
              if (name === null) continue;
              items.push({ name, value: storage.getItem(name) ?? '' });
            }
            return items;
          };
          return { local: read(window.localStorage), session: read(window.sessionStorage) };
        })
        .catch(() => ({ local: [], session: [] }));

      if (!localStorageByOrigin.has(origin)) localStorageByOrigin.set(origin, new Map());
      if (!sessionStorageByOrigin.has(origin)) sessionStorageByOrigin.set(origin, new Map());
      for (const item of dump.local) localStorageByOrigin.get(origin).set(item.name, item.value);
      for (const item of dump.session)
        sessionStorageByOrigin.get(origin).set(item.name, item.value);
    }
  }

  await browser.close();

  const origins = [...localStorageByOrigin.entries()]
    .filter(([, items]) => items.size > 0)
    .map(([origin, items]) => ({
      origin,
      localStorage: [...items.entries()].map(([name, value]) => ({ name, value })),
    }));

  const sessionStorage = [...sessionStorageByOrigin.entries()]
    .filter(([, items]) => items.size > 0)
    .map(([origin, items]) => ({
      origin,
      items: [...items.entries()].map(([name, value]) => ({ name, value })),
    }));

  const snapshot = {
    capturedAt: new Date().toISOString(),
    source: 'cdp',
    cdpEndpoint: endpoint,
    storageState: { cookies, origins },
    sessionStorage,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(
    `\nCaptured browser storage snapshot:\n` +
      `  cookies:              ${cookies.length}\n` +
      `  localStorage origins: ${origins.length}\n` +
      `  sessionStorage origins: ${sessionStorage.length}\n` +
      `  inspected open tabs:  ${inspectedPages}\n` +
      `  written to:           ${outPath}\n\n` +
      `Add this to .env.local so the worker uses it:\n` +
      `  TORQUECORE_BROWSER_STORAGE_STATE_PATH=${outPath}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
