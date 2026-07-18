import { readFile } from 'node:fs/promises';

import type { BrowserContext, BrowserContextOptions } from 'playwright';
import { z } from 'zod';

/**
 * Shared loader for an operator-captured browser-storage snapshot (cookies +
 * localStorage + sessionStorage) exported from their own Chrome via the remote
 * debugging port (see `apps/worker/scripts/capture-browser-storage.mjs`).
 *
 * Both shipment-tracking paths hydrate it into their browser contexts so
 * consent walls, logins and anti-bot clearance cookies carry over:
 *   - the canonical run (`run.ts`), and
 *   - the automation-hub executor (`browser-job-executor.ts`).
 */
export const browserStorageSnapshotSchema = z.object({
  storageState: z
    .object({
      cookies: z.array(z.any()).default([]),
      origins: z.array(z.any()).default([]),
    })
    .default({ cookies: [], origins: [] }),
  sessionStorage: z
    .array(
      z.object({
        origin: z.string(),
        items: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
      }),
    )
    .default([]),
});

export type LoadedBrowserStorage = {
  storageState: { cookies: unknown[]; origins: unknown[] };
  sessionStorage: Array<{ origin: string; items: Array<{ name: string; value: string }> }>;
};

/**
 * Load a snapshot from disk. Cookies and localStorage ride along in Playwright's
 * native `storageState` shape; sessionStorage is captured separately and
 * hydrated per origin via an init script (storageState does not carry it).
 * Missing or malformed files degrade gracefully to "no snapshot".
 */
export async function loadBrowserStorageSnapshot(
  path: string | undefined,
): Promise<LoadedBrowserStorage | null> {
  if (!path) return null;
  try {
    const parsed = browserStorageSnapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const hasCookies = parsed.storageState.cookies.length > 0;
    const hasLocalStorage = parsed.storageState.origins.length > 0;
    const hasSessionStorage = parsed.sessionStorage.length > 0;
    if (!hasCookies && !hasLocalStorage && !hasSessionStorage) return null;
    return { storageState: parsed.storageState, sessionStorage: parsed.sessionStorage };
  } catch (error) {
    console.warn(
      JSON.stringify({
        job: 'shipment_tracking_browser_storage',
        event: 'snapshot_load_failed',
        path,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      }),
    );
    return null;
  }
}

/** Native storageState (cookies + localStorage) for `newContext`, or undefined when empty. */
export function storageStateForContext(
  snapshot: LoadedBrowserStorage | null,
): BrowserContextOptions['storageState'] | undefined {
  if (!snapshot) return undefined;
  if (snapshot.storageState.cookies.length === 0 && snapshot.storageState.origins.length === 0) {
    return undefined;
  }
  return snapshot.storageState as BrowserContextOptions['storageState'];
}

/**
 * Replay captured sessionStorage per origin with an init script that runs before
 * the page's own scripts. Applies to every page created after this call.
 */
export async function applySessionStorageInit(
  context: BrowserContext,
  snapshot: LoadedBrowserStorage | null,
): Promise<void> {
  if (!snapshot || snapshot.sessionStorage.length === 0) return;
  await context.addInitScript((origins: LoadedBrowserStorage['sessionStorage']) => {
    try {
      const match = origins.find((entry) => entry.origin === window.location.origin);
      if (!match) return;
      for (const item of match.items) {
        window.sessionStorage.setItem(item.name, item.value);
      }
    } catch {
      // Best-effort hydration only.
    }
  }, snapshot.sessionStorage);
}
