'use client';

/**
 * Live panel for a manual browser takeover session.
 *
 * Polls the worker for status every 3 s and renders:
 *  - current state badge (pending / browser_opened / waiting_for_user / …)
 *  - activity counters (jobs / pages / pending URLs / phase)
 *  - countdown until auto-close (or the reason it's blocked)
 *  - keep-open toggle + Close-now / Reopen buttons
 *  - tailing logs (last ~20 lines)
 *
 * No new fetch logic — uses the server actions added in `actions/scrape.ts`.
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  closeManualBrowserNow,
  completeManualBrowser,
  refreshManualSession,
  reopenManualBrowser,
  setManualKeepOpen,
} from '@/server/actions/scrape';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface SessionView {
  id: string;
  url: string;
  domain: string;
  status: string;
  logs: string[];
  keepOpen: boolean;
  closedAt: string | null;
  storagePersisted: boolean;
  hasStorageState: boolean;
  activity: {
    activeJobsCount: number;
    activePagesCount: number;
    pendingUrlsCount: number;
    pendingRetriesCount: number;
    phase: string;
    lastActivityAt: number;
  };
  autoCloseBlockedBy: string | null;
  autoCloseInSeconds: number | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'> = {
  pending: 'secondary',
  browser_opened: 'default',
  waiting_for_user: 'warning',
  resumed: 'default',
  scraping_active: 'default',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
  expired: 'destructive',
};

const BLOCK_REASON_HUMAN: Record<string, string> = {
  session_active: 'Session is active.',
  pinned_keep_open: 'Pinned: keep-open is on.',
  jobs_in_flight: 'Scraping jobs still running.',
  pages_in_flight: 'Browser pages still loading.',
  urls_pending: 'URLs still queued.',
  retries_pending: 'Retries pending.',
  storage_not_persisted: 'Cookies/storage not yet saved.',
  awaiting_user: 'Waiting for user action.',
  within_inactivity_window: 'Still inside the inactivity window.',
};

export function ManualSessionPanel({
  sessionId,
  initialSession,
}: {
  sessionId: string;
  initialSession?: SessionView | null;
}) {
  const [session, setSession] = useState<SessionView | null>(initialSession ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isClosed = Boolean(session?.closedAt);

  async function refresh() {
    const r = await refreshManualSession({ sessionId });
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    const body = r.data as { ok?: boolean; session?: SessionView };
    if (body.ok && body.session) {
      setSession(body.session);
      setError(null);
    } else if (body.session === undefined) {
      setError('Session no longer exists on the worker.');
    }
  }

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await refresh().catch(() => null);
    };
    void tick();
    const interval = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function withRefresh<T>(fn: () => Promise<{ ok: boolean; data?: T; error?: { message: string } }>) {
    return () =>
      start(async () => {
        const r = await fn();
        if (!r.ok && r.error) {
          toast.error(r.error.message);
          return;
        }
        await refresh();
      });
  }

  const onToggleKeepOpen = (next: boolean) =>
    start(async () => {
      const r = await setManualKeepOpen({ sessionId, keepOpen: next });
      if (!r.ok) toast.error(r.error.message);
      await refresh();
    });

  const onCloseNow = withRefresh(() => closeManualBrowserNow({ sessionId }));
  const onReopen = withRefresh(() => reopenManualBrowser({ sessionId }));
  const onComplete = withRefresh(() =>
    completeManualBrowser({ sessionId, note: 'marked done from UI' }),
  );

  if (!session) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Manual session not loaded yet…
      </div>
    );
  }

  const statusVariant = STATUS_VARIANTS[session.status] ?? 'outline';
  const blockReason = session.autoCloseBlockedBy
    ? BLOCK_REASON_HUMAN[session.autoCloseBlockedBy] ?? session.autoCloseBlockedBy
    : null;

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant}>{session.status}</Badge>
            {isClosed ? <Badge variant="outline">browser closed</Badge> : null}
            {session.keepOpen ? <Badge variant="warning">keep-open</Badge> : null}
            {session.storagePersisted ? (
              <Badge variant="outline">storage saved</Badge>
            ) : (
              <Badge variant="outline">storage pending</Badge>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {session.domain} · phase: {session.activity.phase}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {session.autoCloseInSeconds != null ? (
            <div>
              auto-close in <span className="font-medium text-foreground">{session.autoCloseInSeconds}s</span>
            </div>
          ) : blockReason ? (
            <div>auto-close blocked: {blockReason}</div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Jobs" value={session.activity.activeJobsCount} />
        <Stat label="Pages" value={session.activity.activePagesCount} />
        <Stat label="URLs pending" value={session.activity.pendingUrlsCount} />
        <Stat label="Retries" value={session.activity.pendingRetriesCount} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={session.keepOpen}
            onCheckedChange={onToggleKeepOpen}
            disabled={pending || isClosed}
          />
          Keep browser open
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {isClosed ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onReopen}>
              Reopen browser
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={onComplete}>
                Mark complete
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending || session.status === 'waiting_for_user'}
                onClick={onCloseNow}
                title={
                  session.status === 'waiting_for_user'
                    ? 'Cannot close while waiting for user action'
                    : undefined
                }
              >
                Close now
              </Button>
            </>
          )}
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">
          Session log ({session.logs.length})
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
          {session.logs.slice(-25).join('\n')}
        </pre>
      </details>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
