import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATUSES,
  decideAutoClose,
  isActive,
  isTerminal,
  TERMINAL_STATUSES,
  transition,
  type AutoCloseInputs,
} from './manual-session-state-machine.js';

describe('transition table', () => {
  it('walks the happy path pending → completed', () => {
    let s = transition('pending', 'browser_started')!;
    expect(s).toBe('browser_opened');
    s = transition(s, 'navigation_done')!;
    expect(s).toBe('waiting_for_user');
    s = transition(s, 'manual_action_completed')!;
    expect(s).toBe('resumed');
    s = transition(s, 'scrape_started')!;
    expect(s).toBe('scraping_active');
    s = transition(s, 'scrape_finished')!;
    expect(s).toBe('scraping_active');
    s = transition(s, 'all_work_drained')!;
    expect(s).toBe('completed');
  });

  it('captcha re-detected during scraping bounces back to waiting_for_user', () => {
    expect(transition('scraping_active', 'captcha_detected')).toBe('waiting_for_user');
    expect(transition('resumed', 'captcha_detected')).toBe('waiting_for_user');
  });

  it('rejects illegal transitions', () => {
    expect(transition('pending', 'manual_action_completed')).toBeNull();
    expect(transition('completed', 'scrape_started')).toBeNull();
    expect(transition('cancelled', 'scrape_finished')).toBeNull();
  });

  it('classifies terminal vs active statuses', () => {
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true);
    for (const s of ACTIVE_STATUSES) expect(isActive(s)).toBe(true);
    expect(isTerminal('scraping_active')).toBe(false);
    expect(isActive('completed')).toBe(false);
  });
});

const baseInputs = (over: Partial<AutoCloseInputs> = {}): AutoCloseInputs => ({
  status: 'scraping_active',
  activePagesCount: 0,
  pendingUrlsCount: 0,
  activeJobsCount: 0,
  pendingRetriesCount: 0,
  storageStatePersisted: true,
  keepOpen: false,
  lastActivityAt: Date.now() - 10 * 60_000, // 10 min ago by default
  now: Date.now(),
  inactivityMs: 5 * 60_000,
  ...over,
});

describe('decideAutoClose', () => {
  it('refuses to close when keep-open is pinned, regardless of idle time', () => {
    const d = decideAutoClose(baseInputs({ keepOpen: true, status: 'completed' }));
    expect(d).toEqual({ close: false, reason: 'pinned_keep_open' });
  });

  it('refuses while jobs are in flight even if everything else is idle', () => {
    const d = decideAutoClose(baseInputs({ activeJobsCount: 2 }));
    expect(d).toEqual({ close: false, reason: 'jobs_in_flight' });
  });

  it('refuses while a captcha wait is on screen', () => {
    const d = decideAutoClose(baseInputs({ status: 'waiting_for_user' }));
    expect(d).toEqual({ close: false, reason: 'awaiting_user' });
  });

  it('refuses while pages or URLs or retries are pending', () => {
    expect(decideAutoClose(baseInputs({ activePagesCount: 1 }))).toMatchObject({
      reason: 'pages_in_flight',
    });
    expect(decideAutoClose(baseInputs({ pendingUrlsCount: 5 }))).toMatchObject({
      reason: 'urls_pending',
    });
    expect(decideAutoClose(baseInputs({ pendingRetriesCount: 1 }))).toMatchObject({
      reason: 'retries_pending',
    });
  });

  it('refuses if storage state has not been persisted yet', () => {
    const d = decideAutoClose(baseInputs({ storageStatePersisted: false, status: 'completed' }));
    expect(d).toEqual({ close: false, reason: 'storage_not_persisted' });
  });

  it('closes when status is completed and every safety condition is met', () => {
    const d = decideAutoClose(baseInputs({ status: 'completed' }));
    expect(d).toEqual({ close: true, reason: 'completed' });
  });

  it('closes after inactivity timeout', () => {
    const d = decideAutoClose(
      baseInputs({
        status: 'scraping_active',
        lastActivityAt: Date.now() - 10 * 60_000,
        inactivityMs: 5 * 60_000,
      }),
    );
    expect(d).toEqual({ close: true, reason: 'inactivity_timeout' });
  });

  it('keeps the browser open inside the inactivity window for active sessions', () => {
    const d = decideAutoClose(
      baseInputs({
        status: 'scraping_active',
        lastActivityAt: Date.now() - 30_000,
        inactivityMs: 5 * 60_000,
      }),
    );
    expect(d.close).toBe(false);
    expect(d.reason).toBe('within_inactivity_window');
  });

  it('closes immediately for terminal non-completed statuses (failed/cancelled/expired)', () => {
    for (const s of ['failed', 'cancelled', 'expired'] as const) {
      const d = decideAutoClose(baseInputs({ status: s, lastActivityAt: Date.now() }));
      expect(d.close).toBe(true);
    }
  });
});
