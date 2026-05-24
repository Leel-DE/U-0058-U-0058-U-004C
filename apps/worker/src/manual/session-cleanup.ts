/**
 * Background sweeper for manual sessions.
 *
 * Two responsibilities:
 *   1. Auto-close sessions whose work is drained or whose inactivity window
 *      elapsed (delegates the decision to `BrowserSessionManager`).
 *   2. Garbage-collect long-closed sessions so the in-memory map stays small,
 *      and clean up zombie browser processes whose contexts already detached.
 *
 * Started once from server.ts via `startSessionCleanup()`. Stop with
 * `stopSessionCleanup()`. Safe to call start multiple times (idempotent).
 */

import pino from 'pino';
import { expireAndCleanup, gcClosedSessions, list } from './browser-session-manager.js';

const logger = pino({ name: 'cr-worker.session-cleanup', level: process.env.LOG_LEVEL ?? 'info' });

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let gcTimer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

const SWEEP_INTERVAL_MS = Number(process.env.MANUAL_SESSION_SWEEP_MS ?? 15_000);
const GC_INTERVAL_MS = Number(process.env.MANUAL_SESSION_GC_MS ?? 5 * 60_000);
const GC_MAX_AGE_MS = Number(process.env.MANUAL_SESSION_GC_MAX_AGE_MS ?? 60 * 60_000);

async function sweepOnce(): Promise<void> {
  if (sweeping) return; // overlap guard — slow sweep should never re-enter
  sweeping = true;
  try {
    const before = list();
    const result = await expireAndCleanup();
    if (result.closed > 0 || result.expired > 0) {
      logger.info(
        {
          event: 'session.cleanup.sweep',
          expired: result.expired,
          closed: result.closed,
          totalSessions: before.length,
        },
        'session sweep ran',
      );
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'session sweep failed');
  } finally {
    sweeping = false;
  }
}

function gcOnce(): void {
  try {
    const removed = gcClosedSessions(GC_MAX_AGE_MS);
    if (removed > 0) {
      logger.info({ event: 'session.cleanup.gc', removed }, 'closed-session gc ran');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'session gc failed');
  }
}

export function startSessionCleanup(): void {
  if (sweepTimer || gcTimer) return;
  sweepTimer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS);
  gcTimer = setInterval(gcOnce, GC_INTERVAL_MS);
  // Don't keep the Node event loop alive for these timers
  sweepTimer.unref?.();
  gcTimer.unref?.();
  logger.info(
    { sweepEveryMs: SWEEP_INTERVAL_MS, gcEveryMs: GC_INTERVAL_MS },
    'manual session cleanup loop started',
  );
}

export function stopSessionCleanup(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  if (gcTimer) clearInterval(gcTimer);
  sweepTimer = null;
  gcTimer = null;
}

/** Exposed for one-shot use from tests / shutdown. */
export async function runSweepNow(): Promise<void> {
  await sweepOnce();
  gcOnce();
}
