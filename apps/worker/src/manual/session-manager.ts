/**
 * Backwards-compatible facade over `browser-session-manager.ts`.
 *
 * The original `session-manager.ts` exposed:
 *   startManualSession / continueManualSession / cancelManualSession /
 *   markManualSession / sessionStatus / getDomainStorageState.
 *
 * Server code in `server.ts` still imports those names — we keep them, but
 * route every call into the richer `browser-session-manager` so all
 * sessions benefit from the new lifecycle (state machine, activity
 * tracking, graceful close, cleanup loop).
 */
import type { FetchResult } from '../types.js';
import {
  cancel as cancelInternal,
  complete as completeInternal,
  fireEvent,
  get,
  getDomainStorageState as getDomainStorageStateInternal,
  navigateInSession as navigateInSessionInternal,
  readPage,
  rehydrateFromDisk as rehydrateFromDiskInternal,
  start,
  tearDownIfReady as tearDownIfReadyInternal,
  type SessionView,
} from './browser-session-manager.js';
import type { SessionStatus } from './manual-session-state-machine.js';

/**
 * Legacy status names used by callers before the state-machine refactor.
 * Accepts both old and new names so caller code does not have to change.
 */
export type ManualSessionStatus =
  | SessionStatus
  | 'waiting_for_manual_action'
  | 'scraping_in_browser'
  | 'preview_ready'
  | 'continued';

function legacyShape(view: SessionView | null) {
  if (!view) return null;
  return {
    id: view.id,
    url: view.url,
    domain: view.domain,
    status: view.status,
    logs: view.logs,
    createdAt: view.createdAt,
    expiresAt: view.expiresAt,
    hasStorageState: view.hasStorageState,
    storagePersisted: view.storagePersisted,
    keepOpen: view.keepOpen,
    activity: view.activity,
    autoCloseBlockedBy: view.autoCloseBlockedBy,
    autoCloseInSeconds: view.autoCloseInSeconds,
    closedAt: view.closedAt,
  };
}

export async function startManualSession(
  url: string,
  userAgent: string,
  timeoutMs = 60_000,
) {
  const view = await start({ url, userAgent, navigateTimeoutMs: timeoutMs });
  return legacyShape(view);
}

export function markManualSession(
  id: string,
  status: ManualSessionStatus,
  log?: string,
) {
  switch (status) {
    case 'waiting_for_manual_action':
    case 'waiting_for_user':
      return legacyShape(fireEvent(id, 'captcha_detected', log));
    case 'preview_ready':
    case 'continued':
    case 'resumed':
      return legacyShape(fireEvent(id, 'manual_action_completed', log));
    case 'scraping_in_browser':
    case 'scraping_active':
      return legacyShape(fireEvent(id, 'scrape_started', log));
    case 'failed':
      return legacyShape(fireEvent(id, 'fail', log));
    case 'cancelled':
      return legacyShape(fireEvent(id, 'cancel', log));
    case 'expired':
      return legacyShape(fireEvent(id, 'expire', log));
    case 'completed':
      return legacyShape(fireEvent(id, 'all_work_drained', log));
    default:
      return legacyShape(get(id));
  }
}

export async function continueManualSession(
  id: string,
  timeoutMs = 30_000,
): Promise<{ status: ReturnType<typeof legacyShape>; fetched?: FetchResult }> {
  // "Continue" means the user has acted on the page (solved captcha, logged in).
  fireEvent(id, 'manual_action_completed', 'continue requested by operator');
  const { view, fetched } = await readPage(id, timeoutMs);
  return { status: legacyShape(view), fetched };
}

export async function cancelManualSession(id: string) {
  return legacyShape(await cancelInternal(id));
}

export function sessionStatus(id: string) {
  return legacyShape(get(id));
}

export function getDomainStorageState(domain: string) {
  return getDomainStorageStateInternal(domain);
}

export async function rehydrateFromDisk() {
  return rehydrateFromDiskInternal();
}

/**
 * Reuse the visible browser from an existing manual session to fetch a new URL
 * (same domain). Used by the discovery runner to keep crawling through the
 * cookie-warmed browser after the user solves a captcha.
 */
export async function navigateInManualSession(
  id: string,
  url: string,
  timeoutMs = 30_000,
): Promise<{ status: ReturnType<typeof legacyShape>; fetched?: FetchResult }> {
  const { view, fetched } = await navigateInSessionInternal(id, url, timeoutMs);
  return { status: legacyShape(view), fetched };
}

/**
 * Mark a session as having no more pending work. Fires `all_work_drained` and
 * runs one tear-down sweep — if all activity counters are zero and storage is
 * persisted, the browser closes immediately.
 */
export async function completeManualSession(id: string, note?: string) {
  completeInternal(id, note);
  const view = await tearDownIfReadyInternal(id);
  return legacyShape(view);
}
