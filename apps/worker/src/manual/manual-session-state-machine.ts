/**
 * Pure state machine for manual browser takeover sessions.
 *
 * No side effects, no Playwright, no I/O — just transition rules.
 * Designed so we can unit-test every legal/illegal transition and use it
 * from BrowserSessionManager as the single source of truth for "what is
 * allowed to happen next".
 */

export type SessionStatus =
  | 'pending'
  | 'browser_opened'
  | 'waiting_for_user'
  | 'resumed'
  | 'scraping_active'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** Mid-flight statuses where the browser is alive and may be doing work. */
export const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  'browser_opened',
  'waiting_for_user',
  'resumed',
  'scraping_active',
]);

/** Terminal statuses — once entered, the session does not transition again. */
export const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  'completed',
  'failed',
  'cancelled',
  'expired',
]);

export type SessionEvent =
  | 'browser_started'
  | 'navigation_done'
  | 'captcha_detected'
  | 'manual_action_completed'
  | 'scrape_started'
  | 'scrape_finished'
  | 'all_work_drained'
  | 'fail'
  | 'cancel'
  | 'expire';

/**
 * Allowed (from, event) → to transitions.
 * Anything not listed is rejected by `transition()` (returns null).
 */
const TRANSITIONS: ReadonlyArray<{
  from: SessionStatus;
  event: SessionEvent;
  to: SessionStatus;
}> = [
  { from: 'pending', event: 'browser_started', to: 'browser_opened' },
  { from: 'pending', event: 'fail', to: 'failed' },
  { from: 'pending', event: 'cancel', to: 'cancelled' },

  { from: 'browser_opened', event: 'navigation_done', to: 'waiting_for_user' },
  { from: 'browser_opened', event: 'captcha_detected', to: 'waiting_for_user' },
  { from: 'browser_opened', event: 'scrape_started', to: 'scraping_active' },
  { from: 'browser_opened', event: 'fail', to: 'failed' },
  { from: 'browser_opened', event: 'cancel', to: 'cancelled' },
  { from: 'browser_opened', event: 'expire', to: 'expired' },

  { from: 'waiting_for_user', event: 'manual_action_completed', to: 'resumed' },
  { from: 'waiting_for_user', event: 'captcha_detected', to: 'waiting_for_user' },
  { from: 'waiting_for_user', event: 'fail', to: 'failed' },
  { from: 'waiting_for_user', event: 'cancel', to: 'cancelled' },
  { from: 'waiting_for_user', event: 'expire', to: 'expired' },

  { from: 'resumed', event: 'scrape_started', to: 'scraping_active' },
  { from: 'resumed', event: 'captcha_detected', to: 'waiting_for_user' },
  { from: 'resumed', event: 'all_work_drained', to: 'completed' },
  { from: 'resumed', event: 'fail', to: 'failed' },
  { from: 'resumed', event: 'cancel', to: 'cancelled' },
  { from: 'resumed', event: 'expire', to: 'expired' },

  { from: 'scraping_active', event: 'scrape_finished', to: 'scraping_active' }, // self-loop while jobs in-flight
  { from: 'scraping_active', event: 'scrape_started', to: 'scraping_active' },
  { from: 'scraping_active', event: 'captcha_detected', to: 'waiting_for_user' },
  { from: 'scraping_active', event: 'all_work_drained', to: 'completed' },
  { from: 'scraping_active', event: 'fail', to: 'failed' },
  { from: 'scraping_active', event: 'cancel', to: 'cancelled' },
  { from: 'scraping_active', event: 'expire', to: 'expired' },
];

const lookup = new Map<string, SessionStatus>();
for (const t of TRANSITIONS) lookup.set(`${t.from}|${t.event}`, t.to);

export function transition(from: SessionStatus, event: SessionEvent): SessionStatus | null {
  return lookup.get(`${from}|${event}`) ?? null;
}

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: SessionStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export interface AutoCloseInputs {
  status: SessionStatus;
  /** Pages currently being parsed/loaded inside this session's browser context. */
  activePagesCount: number;
  /** URLs queued for this session but not yet started. */
  pendingUrlsCount: number;
  /** Jobs (start/continue/discovery batch) currently in-flight against this session. */
  activeJobsCount: number;
  /** Retry attempts scheduled by the worker for this session. */
  pendingRetriesCount: number;
  /** Storage state (cookies, localStorage) successfully written to disk. */
  storageStatePersisted: boolean;
  /** User toggled "keep open" on the session. */
  keepOpen: boolean;
  /** Last activity timestamp (ms). */
  lastActivityAt: number;
  now: number;
  /** Inactivity timeout (ms) after which we consider the session abandonable. */
  inactivityMs: number;
}

export type AutoCloseDecision =
  | { close: true; reason: 'completed' | 'inactivity_timeout' }
  | { close: false; reason: AutoCloseBlockReason };

export type AutoCloseBlockReason =
  | 'session_active'
  | 'pinned_keep_open'
  | 'jobs_in_flight'
  | 'pages_in_flight'
  | 'urls_pending'
  | 'retries_pending'
  | 'storage_not_persisted'
  | 'awaiting_user'
  | 'within_inactivity_window';

/**
 * Decide whether the browser may be torn down right now.
 *
 * Returns `{close: true, reason}` ONLY when every safety condition is met:
 *   - queue empty, no active pages, no pending retries, no in-flight jobs,
 *     storage persisted, status is terminal-ready OR inactivity timed out,
 *     and session is not pinned by `keepOpen`.
 *
 * Otherwise returns a `block` decision identifying the first failing check
 * so the caller can show a meaningful "browser stays open because…" message.
 */
export function decideAutoClose(i: AutoCloseInputs): AutoCloseDecision {
  if (i.keepOpen) return { close: false, reason: 'pinned_keep_open' };

  if (i.status === 'waiting_for_user') return { close: false, reason: 'awaiting_user' };
  if (i.activeJobsCount > 0) return { close: false, reason: 'jobs_in_flight' };
  if (i.activePagesCount > 0) return { close: false, reason: 'pages_in_flight' };
  if (i.pendingUrlsCount > 0) return { close: false, reason: 'urls_pending' };
  if (i.pendingRetriesCount > 0) return { close: false, reason: 'retries_pending' };
  if (!i.storageStatePersisted) return { close: false, reason: 'storage_not_persisted' };

  if (i.status === 'completed') return { close: true, reason: 'completed' };

  const idleFor = i.now - i.lastActivityAt;
  if (idleFor >= i.inactivityMs) return { close: true, reason: 'inactivity_timeout' };

  if (isActive(i.status)) return { close: false, reason: 'within_inactivity_window' };

  // Status already terminal (failed/cancelled/expired) — safe to drop browser.
  return { close: true, reason: 'completed' };
}
