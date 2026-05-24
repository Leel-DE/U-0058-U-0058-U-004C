/**
 * Stateful manager for headed-browser manual takeover sessions.
 *
 * Responsibilities:
 *   - Maintain a single source of truth for every active session (Map).
 *   - Track per-session activity counters (jobs / pages / pending URLs / retries).
 *   - Run state-machine transitions via `manual-session-state-machine`.
 *   - Persist storage state (cookies + localStorage) to disk so reuse across
 *     sessions works even after the browser closes.
 *   - Tear down browsers ONLY when `decideAutoClose` says it is safe, and only
 *     once per session (mutex on the closing flag).
 *   - Emit structured logs for every lifecycle event.
 *
 * What this file DOES NOT do:
 *   - Decide on captcha / parse strategy → that lives in `server.ts` and parsers.
 *   - Touch the database → all session state stays in-process for MVP. The DB
 *     mirror, when added, can subscribe to the same logs/events.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import {
  decideAutoClose,
  isTerminal,
  transition,
  type AutoCloseBlockReason,
  type SessionEvent,
  type SessionStatus,
} from './manual-session-state-machine.js';
import type { FetchResult } from '../types.js';

const logger = pino({ name: 'cr-worker.browser-session-manager', level: process.env.LOG_LEVEL ?? 'info' });

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
const DOMAIN_STATE_TTL_MS = 30 * 60 * 1000;

const STORAGE_DIR = process.env.MANUAL_SESSION_STORAGE_DIR ?? join(tmpdir(), 'cr-manual-storage');

export type ActivityPhase =
  | 'idle'
  | 'navigating'
  | 'awaiting_user'
  | 'extracting'
  | 'discovering'
  | 'paginating'
  | 'persisting'
  | 'closing';

export interface ActivityCounters {
  activeJobsCount: number;
  activePagesCount: number;
  pendingUrlsCount: number;
  pendingRetriesCount: number;
  phase: ActivityPhase;
  lastActivityAt: number;
}

export interface SessionView {
  id: string;
  url: string;
  domain: string;
  userAgent: string;
  status: SessionStatus;
  logs: string[];
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  hasStorageState: boolean;
  storagePersisted: boolean;
  keepOpen: boolean;
  closedAt: string | null;
  activity: ActivityCounters;
  autoCloseBlockedBy: AutoCloseBlockReason | null;
  /** Seconds left before auto-close fires (rounded down, never negative). null when no countdown. */
  autoCloseInSeconds: number | null;
}

interface InternalSession {
  id: string;
  url: string;
  domain: string;
  userAgent: string;
  status: SessionStatus;
  logs: string[];
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  context: BrowserContext | null;
  page: Page | null;
  storageStateJson: string | null;
  storagePersisted: boolean;
  keepOpen: boolean;
  closedAt: number | null;
  closing: boolean; // mutex against double-close
  userDataDir: string | null;
  inactivityMs: number;
  activity: ActivityCounters;
}

interface DomainCacheRow {
  storageState: string;
  cookiesHash: string;
  expiresAt: number;
  lastUsedAt: number;
}

const sessions = new Map<string, InternalSession>();
const domainStorage = new Map<string, DomainCacheRow>();

function newCounters(): ActivityCounters {
  return {
    activeJobsCount: 0,
    activePagesCount: 0,
    pendingUrlsCount: 0,
    pendingRetriesCount: 0,
    phase: 'idle',
    lastActivityAt: Date.now(),
  };
}

function bump(session: InternalSession): void {
  session.lastActivityAt = Date.now();
  session.activity.lastActivityAt = session.lastActivityAt;
}

function log(session: InternalSession, line: string): void {
  const entry = `[${new Date().toISOString()}] ${line}`;
  session.logs.push(entry);
  if (session.logs.length > 200) session.logs.splice(0, session.logs.length - 200);
}

function structuredLog(event: string, extra: Record<string, unknown>): void {
  logger.info({ event, ...extra }, event);
}

function viewOf(session: InternalSession): SessionView {
  const now = Date.now();
  const decision = decideAutoClose({
    status: session.status,
    activePagesCount: session.activity.activePagesCount,
    pendingUrlsCount: session.activity.pendingUrlsCount,
    activeJobsCount: session.activity.activeJobsCount,
    pendingRetriesCount: session.activity.pendingRetriesCount,
    storageStatePersisted: session.storagePersisted,
    keepOpen: session.keepOpen,
    lastActivityAt: session.lastActivityAt,
    now,
    inactivityMs: session.inactivityMs,
  });

  let autoCloseInSeconds: number | null = null;
  if (
    !decision.close &&
    decision.reason === 'within_inactivity_window' &&
    !session.keepOpen
  ) {
    const remainingMs = Math.max(0, session.lastActivityAt + session.inactivityMs - now);
    autoCloseInSeconds = Math.floor(remainingMs / 1000);
  }

  return {
    id: session.id,
    url: session.url,
    domain: session.domain,
    userAgent: session.userAgent,
    status: session.status,
    logs: [...session.logs],
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    hasStorageState: Boolean(session.storageStateJson),
    storagePersisted: session.storagePersisted,
    keepOpen: session.keepOpen,
    closedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
    activity: { ...session.activity },
    autoCloseBlockedBy: decision.close ? null : decision.reason,
    autoCloseInSeconds,
  };
}

function fire(session: InternalSession, event: SessionEvent, note?: string): SessionStatus {
  const next = transition(session.status, event);
  if (!next) {
    log(session, `state: event '${event}' rejected in '${session.status}'`);
    return session.status;
  }
  if (next === session.status) {
    if (note) log(session, note);
    return session.status;
  }
  const prev = session.status;
  session.status = next;
  if (note) log(session, note);
  structuredLog('session.transition', { id: session.id, from: prev, to: next, event });
  return next;
}

async function persistStorageState(session: InternalSession): Promise<boolean> {
  if (!session.context) return false;
  try {
    if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true });
    const state = await session.context.storageState();
    const json = JSON.stringify(state);
    const filename = `${session.domain.replace(/[^a-z0-9.-]/gi, '_')}.json`;
    await writeFile(join(STORAGE_DIR, filename), json, 'utf8');
    session.storageStateJson = json;
    session.storagePersisted = true;

    const cookiesHash = createHash('sha256').update(JSON.stringify(state.cookies)).digest('hex');
    domainStorage.set(session.domain, {
      storageState: json,
      cookiesHash,
      expiresAt: Date.now() + DOMAIN_STATE_TTL_MS,
      lastUsedAt: Date.now(),
    });
    structuredLog('session.storage_persisted', {
      id: session.id,
      domain: session.domain,
      cookiesCount: state.cookies.length,
    });
    return true;
  } catch (err) {
    log(session, `storage_persist_failed: ${(err as Error).message}`);
    structuredLog('session.storage_persist_failed', {
      id: session.id,
      error: (err as Error).message,
    });
    return false;
  }
}

async function gracefulClose(
  session: InternalSession,
  reason: 'completed' | 'inactivity_timeout' | 'cancelled' | 'expired' | 'failed' | 'manual',
): Promise<void> {
  if (session.closing || session.closedAt) {
    structuredLog('session.close_skipped_already_closing', { id: session.id, reason });
    return;
  }
  session.closing = true;
  const prevPhase = session.activity.phase;
  session.activity.phase = 'closing';
  structuredLog('session.close_started', { id: session.id, reason });
  log(session, `closing browser (${reason}) …`);

  // 1. Save storage state (best-effort, don't block close on failure).
  await persistStorageState(session);

  // 2. Close all pages first (gives extensions/listeners a chance to drain).
  try {
    if (session.context) {
      const pages = session.context.pages();
      for (const p of pages) {
        await p.close({ runBeforeUnload: false }).catch(() => null);
      }
    }
  } catch (err) {
    log(session, `page_close_warn: ${(err as Error).message}`);
  }

  // 3. Close context.
  try {
    await session.context?.close().catch(() => null);
  } catch (err) {
    log(session, `context_close_warn: ${(err as Error).message}`);
  }

  session.context = null;
  session.page = null;
  session.closedAt = Date.now();
  session.activity.phase = prevPhase === 'closing' ? 'idle' : 'idle';

  log(session, `browser closed (${reason}).`);
  structuredLog('session.closed', { id: session.id, reason });
}

/** Apply a partial activity update from the scraping pipeline. */
export function recordActivity(
  id: string,
  delta: Partial<Omit<ActivityCounters, 'lastActivityAt'>>,
): SessionView | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (delta.activeJobsCount !== undefined) {
    s.activity.activeJobsCount = Math.max(0, s.activity.activeJobsCount + delta.activeJobsCount);
  }
  if (delta.activePagesCount !== undefined) {
    s.activity.activePagesCount = Math.max(0, s.activity.activePagesCount + delta.activePagesCount);
  }
  if (delta.pendingUrlsCount !== undefined) {
    s.activity.pendingUrlsCount = Math.max(0, s.activity.pendingUrlsCount + delta.pendingUrlsCount);
  }
  if (delta.pendingRetriesCount !== undefined) {
    s.activity.pendingRetriesCount = Math.max(0, s.activity.pendingRetriesCount + delta.pendingRetriesCount);
  }
  if (delta.phase !== undefined) s.activity.phase = delta.phase;
  bump(s);
  return viewOf(s);
}

/** Called by scraping code when it begins a job inside the session's browser. */
export function startJob(id: string, phase: ActivityPhase = 'extracting'): void {
  const s = sessions.get(id);
  if (!s) return;
  s.activity.activeJobsCount += 1;
  s.activity.phase = phase;
  bump(s);
  fire(s, 'scrape_started');
}

/** Called when a job finishes (success or failure). */
export function finishJob(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.activity.activeJobsCount = Math.max(0, s.activity.activeJobsCount - 1);
  bump(s);
  fire(s, 'scrape_finished');
}

export interface StartOpts {
  url: string;
  userAgent: string;
  navigateTimeoutMs?: number;
  inactivityMs?: number;
  ttlMs?: number;
}

export async function start(opts: StartOpts): Promise<SessionView> {
  const id = randomUUID();
  const domain = new URL(opts.url).hostname;
  const userDataDir = await mkdtemp(
    join(tmpdir(), `cr-manual-${domain.replace(/[^a-z0-9.-]/gi, '_')}-`),
  );

  const session: InternalSession = {
    id,
    url: opts.url,
    domain,
    userAgent: opts.userAgent,
    status: 'pending',
    logs: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + (opts.ttlMs ?? DEFAULT_SESSION_TTL_MS),
    lastActivityAt: Date.now(),
    context: null,
    page: null,
    storageStateJson: null,
    storagePersisted: false,
    keepOpen: false,
    closedAt: null,
    closing: false,
    userDataDir,
    inactivityMs: opts.inactivityMs ?? DEFAULT_INACTIVITY_MS,
    activity: newCounters(),
  };
  sessions.set(id, session);
  structuredLog('session.created', { id, domain, url: opts.url });
  log(session, `session created for ${opts.url}`);

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      userAgent: opts.userAgent,
      viewport: null,
      locale: 'en-US',
      args: ['--start-maximized'],
    });
    session.context = context;
    session.page = context.pages()[0] ?? (await context.newPage());

    // If we saved state for this domain previously, hydrate cookies.
    const cached = domainStorage.get(domain);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.storageState) as { cookies?: Parameters<BrowserContext['addCookies']>[0] };
        if (parsed.cookies?.length) {
          await context.addCookies(parsed.cookies);
          log(session, `hydrated ${parsed.cookies.length} cookies from cached storage state for ${domain}`);
        }
      } catch (err) {
        log(session, `storage_hydrate_failed: ${(err as Error).message}`);
      }
    }

    context.on('close', () => {
      // User closed the browser window manually → mark session if still alive.
      const s = sessions.get(id);
      if (!s || s.closedAt) return;
      s.closedAt = Date.now();
      structuredLog('session.browser_closed_by_user', { id });
      log(s, 'browser window closed by user.');
      if (!isTerminal(s.status)) fire(s, 'cancel', 'session marked cancelled (window closed)');
    });

    fire(session, 'browser_started', 'headed browser launched');
    bump(session);

    session.activity.phase = 'navigating';
    await session.page!.goto(opts.url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.navigateTimeoutMs ?? 60_000,
    });
    fire(session, 'navigation_done', 'page loaded; waiting for user to act if needed');
    session.activity.phase = 'awaiting_user';
    bump(session);
  } catch (err) {
    log(session, `start_failed: ${(err as Error).message}`);
    fire(session, 'fail', 'session failed during start');
    structuredLog('session.start_failed', { id, error: (err as Error).message });
    // Tear down the half-built browser so we don't leak a chromium.
    await gracefulClose(session, 'failed').catch(() => null);
  }
  return viewOf(session);
}

/**
 * Reuse this session's headed browser to fetch a new URL on the same domain.
 *
 * Discovery uses this after a captcha is solved so that *every* subsequent
 * page on that domain goes through the cookie-warmed visible browser,
 * instead of bouncing back to a cookie-less Cheerio fetch that will keep
 * re-tripping the same captcha.
 *
 * Caller is responsible for confirming the domain matches the session's
 * domain; we no-op (return null fetched) on cross-domain.
 */
export async function navigateInSession(
  id: string,
  url: string,
  timeoutMs = 30_000,
): Promise<{ view: SessionView | null; fetched?: FetchResult }> {
  const s = sessions.get(id);
  if (!s) return { view: null };
  if (!s.context || !s.page || s.closedAt) {
    log(s, `navigate_in_session_called_after_close: ${url}`);
    return { view: viewOf(s) };
  }
  const sameDomain = (() => {
    try {
      return new URL(url).hostname === s.domain;
    } catch {
      return false;
    }
  })();
  if (!sameDomain) {
    log(s, `navigate_in_session_cross_domain_rejected: ${url}`);
    return { view: viewOf(s) };
  }

  startJob(s.id, 'extracting');
  s.activity.activePagesCount += 1;
  bump(s);

  const t0 = Date.now();
  try {
    await s.page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await s.page
      .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 8_000) })
      .catch(() => null);

    const html = await s.page.content();
    const finalUrl = s.page.url();

    s.activity.phase = 'persisting';
    await persistStorageState(s);
    s.activity.phase = 'extracting';

    return {
      view: viewOf(s),
      fetched: {
        status: 200,
        html,
        finalUrl,
        durationMs: Date.now() - t0,
        strategy: 'playwright',
      },
    };
  } catch (err) {
    log(s, `navigate_in_session_failed: ${(err as Error).message}`);
    return { view: viewOf(s) };
  } finally {
    s.activity.activePagesCount = Math.max(0, s.activity.activePagesCount - 1);
    finishJob(s.id);
  }
}

/** Read the live page HTML, persist storage state, and return a FetchResult. */
export async function readPage(
  id: string,
  timeoutMs = 30_000,
): Promise<{ view: SessionView | null; fetched?: FetchResult }> {
  const s = sessions.get(id);
  if (!s) return { view: null };
  if (!s.context || !s.page || s.closedAt) {
    log(s, 'read_page_called_after_close');
    return { view: viewOf(s) };
  }

  startJob(id, 'extracting');
  s.activity.activePagesCount += 1;
  bump(s);

  const t0 = Date.now();
  try {
    await s.page
      .waitForLoadState('domcontentloaded', { timeout: Math.min(timeoutMs, 10_000) })
      .catch(() => null);
    await s.page
      .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 10_000) })
      .catch(() => null);

    const html = await s.page.content();
    const finalUrl = s.page.url();

    s.activity.phase = 'persisting';
    await persistStorageState(s);
    s.activity.phase = 'idle';

    return {
      view: viewOf(s),
      fetched: {
        status: 200,
        html,
        finalUrl,
        durationMs: Date.now() - t0,
        strategy: 'playwright',
      },
    };
  } catch (err) {
    log(s, `read_page_failed: ${(err as Error).message}`);
    return { view: viewOf(s) };
  } finally {
    s.activity.activePagesCount = Math.max(0, s.activity.activePagesCount - 1);
    finishJob(id);
  }
}

/** Manual marker for "captcha is still on screen" or "user solved it". */
export function fireEvent(id: string, event: SessionEvent, note?: string): SessionView | null {
  const s = sessions.get(id);
  if (!s) return null;
  fire(s, event, note);
  bump(s);
  return viewOf(s);
}

/** Pin the session: caller wants the browser to stay open regardless of activity. */
export function setKeepOpen(id: string, keepOpen: boolean): SessionView | null {
  const s = sessions.get(id);
  if (!s) return null;
  s.keepOpen = keepOpen;
  bump(s);
  log(s, `keep-open ${keepOpen ? 'enabled' : 'disabled'} by operator`);
  structuredLog('session.keep_open_changed', { id, keepOpen });
  return viewOf(s);
}

/** Explicitly cancel — operator clicked "Cancel" in UI. */
export async function cancel(id: string): Promise<SessionView | null> {
  const s = sessions.get(id);
  if (!s) return null;
  fire(s, 'cancel', 'cancelled by operator');
  await gracefulClose(s, 'cancelled');
  return viewOf(s);
}

/** Operator hit "Close now". Same as cancel but only fires when we are not in a captcha wait. */
export async function closeNow(id: string): Promise<SessionView | null> {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.status === 'waiting_for_user') {
    log(s, 'close-now refused while waiting for user');
    return viewOf(s);
  }
  fire(s, 'cancel', 'close-now triggered by operator');
  await gracefulClose(s, 'manual');
  return viewOf(s);
}

/**
 * Operator hit "Reopen browser". We create a fresh chromium context but
 * hydrate it with the previously persisted storage state for the same domain,
 * so cookies/login survive across the reopen.
 */
export async function reopen(id: string): Promise<SessionView | null> {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.context && !s.closedAt) return viewOf(s);

  const userDataDir = await mkdtemp(
    join(tmpdir(), `cr-manual-${s.domain.replace(/[^a-z0-9.-]/gi, '_')}-`),
  );
  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      userAgent: s.userAgent,
      viewport: null,
      locale: 'en-US',
      args: ['--start-maximized'],
    });
    s.context = context;
    s.page = context.pages()[0] ?? (await context.newPage());

    if (s.storageStateJson) {
      try {
        const parsed = JSON.parse(s.storageStateJson) as { cookies?: Parameters<BrowserContext['addCookies']>[0] };
        if (parsed.cookies?.length) await context.addCookies(parsed.cookies);
      } catch {
        // ignore
      }
    }

    s.closedAt = null;
    s.closing = false;
    s.userDataDir = userDataDir;
    s.expiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;
    s.status = 'browser_opened';
    bump(s);
    log(s, 'browser reopened by operator');
    structuredLog('session.reopened', { id });

    await s.page!.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
    fire(s, 'navigation_done', 'reopened browser navigated to original URL');
  } catch (err) {
    log(s, `reopen_failed: ${(err as Error).message}`);
    fire(s, 'fail', 'reopen failed');
  }
  return viewOf(s);
}

/** Mark the session as having no more work to do; auto-close will fire on next sweep. */
export function complete(id: string, note?: string): SessionView | null {
  const s = sessions.get(id);
  if (!s) return null;
  fire(s, 'all_work_drained', note ?? 'no more pending work');
  bump(s);
  return viewOf(s);
}

export function get(id: string): SessionView | null {
  const s = sessions.get(id);
  return s ? viewOf(s) : null;
}

export function list(): SessionView[] {
  return [...sessions.values()].map(viewOf);
}

export async function tearDownIfReady(id: string): Promise<SessionView | null> {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.closedAt) return viewOf(s);

  const now = Date.now();
  const decision = decideAutoClose({
    status: s.status,
    activePagesCount: s.activity.activePagesCount,
    pendingUrlsCount: s.activity.pendingUrlsCount,
    activeJobsCount: s.activity.activeJobsCount,
    pendingRetriesCount: s.activity.pendingRetriesCount,
    storageStatePersisted: s.storagePersisted,
    keepOpen: s.keepOpen,
    lastActivityAt: s.lastActivityAt,
    now,
    inactivityMs: s.inactivityMs,
  });

  if (!decision.close) return viewOf(s);

  if (s.status === 'scraping_active' || s.status === 'resumed') {
    fire(s, 'all_work_drained', `auto-close trigger: ${decision.reason}`);
  } else if (!isTerminal(s.status)) {
    fire(s, decision.reason === 'inactivity_timeout' ? 'expire' : 'all_work_drained');
  }
  await gracefulClose(s, decision.reason === 'inactivity_timeout' ? 'inactivity_timeout' : 'completed');
  return viewOf(s);
}

/** Remove sessions whose browsers are closed AND finished long enough ago. */
export function gcClosedSessions(maxAgeMs = 60 * 60 * 1000): number {
  let removed = 0;
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.closedAt && now - s.closedAt > maxAgeMs) {
      sessions.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) structuredLog('session.gc_closed', { removed });
  return removed;
}

/** Fail-safe: mark anything past hard TTL as expired and tear it down. */
export async function expireAndCleanup(): Promise<{ expired: number; closed: number }> {
  const now = Date.now();
  let expired = 0;
  let closed = 0;
  for (const s of sessions.values()) {
    if (s.expiresAt <= now && !isTerminal(s.status)) {
      fire(s, 'expire', 'hard ttl reached');
      expired += 1;
    }
    if (!s.closedAt) {
      const decision = decideAutoClose({
        status: s.status,
        activePagesCount: s.activity.activePagesCount,
        pendingUrlsCount: s.activity.pendingUrlsCount,
        activeJobsCount: s.activity.activeJobsCount,
        pendingRetriesCount: s.activity.pendingRetriesCount,
        storageStatePersisted: s.storagePersisted,
        keepOpen: s.keepOpen,
        lastActivityAt: s.lastActivityAt,
        now,
        inactivityMs: s.inactivityMs,
      });
      if (decision.close) {
        await gracefulClose(
          s,
          decision.reason === 'inactivity_timeout' ? 'inactivity_timeout' : 'completed',
        );
        closed += 1;
      }
    }
  }
  for (const [domain, st] of domainStorage) if (st.expiresAt <= now) domainStorage.delete(domain);
  return { expired, closed };
}

/** Cached domain storage for the regular Playwright fetcher to hydrate cookies. */
export function getDomainStorageState(domain: string): string | undefined {
  const now = Date.now();
  const cached = domainStorage.get(domain);
  if (!cached) return undefined;
  if (cached.expiresAt <= now) {
    domainStorage.delete(domain);
    return undefined;
  }
  cached.lastUsedAt = now;
  return cached.storageState;
}

/** Load any persisted storage states from disk on worker boot. Best-effort. */
export async function rehydrateFromDisk(): Promise<number> {
  try {
    if (!existsSync(STORAGE_DIR)) return 0;
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(STORAGE_DIR);
    let loaded = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const body = await readFile(join(STORAGE_DIR, f), 'utf8');
        const domain = f.replace(/\.json$/, '');
        const parsed = JSON.parse(body) as { cookies?: unknown[] };
        const cookiesHash = createHash('sha256')
          .update(JSON.stringify(parsed.cookies ?? []))
          .digest('hex');
        domainStorage.set(domain, {
          storageState: body,
          cookiesHash,
          expiresAt: Date.now() + DOMAIN_STATE_TTL_MS,
          lastUsedAt: Date.now(),
        });
        loaded += 1;
      } catch {
        // skip corrupt files
      }
    }
    return loaded;
  } catch {
    return 0;
  }
}

/** For tests only. */
export function _resetForTests(): void {
  sessions.clear();
  domainStorage.clear();
}
