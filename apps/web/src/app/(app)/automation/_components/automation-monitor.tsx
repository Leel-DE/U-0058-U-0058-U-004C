'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type MonitorState = 'disabled' | 'starting' | 'idle' | 'running' | 'stopping' | 'error';

interface AutomationEvent {
  id: string;
  occurredAt: string;
  event: string;
  state: 'info' | 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'recovering';
  message: string;
  jobId?: string;
  subjectId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface MonitorStatus {
  enabled: boolean;
  state: MonitorState;
  activeRun: { id: string; shipmentId: string; trigger: 'manual' | 'schedule' } | null;
  lastOutcome: {
    status: 'succeeded' | 'partial' | 'failed';
    successfulSources: number;
    presentationGenerated: boolean;
    telegramDelivered: boolean;
  } | null;
  lastError: string | null;
  lastReconciledAt: string | null;
  pollMs: number;
  refreshIntervalMs: number;
}

interface AutomationPayload {
  ok: boolean;
  shipmentTracking?: MonitorStatus;
  events?: AutomationEvent[];
  message?: string;
}

function statusVariant(state: MonitorState) {
  if (state === 'idle') return 'success' as const;
  if (state === 'running' || state === 'starting') return 'warning' as const;
  if (state === 'error') return 'destructive' as const;
  return 'secondary' as const;
}

function eventVariant(state: AutomationEvent['state']) {
  if (state === 'succeeded') return 'success' as const;
  if (state === 'failed') return 'destructive' as const;
  if (state === 'running' || state === 'partial' || state === 'recovering')
    return 'warning' as const;
  return 'secondary' as const;
}

function formatTime(value: string | null) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function AutomationMonitor() {
  const [payload, setPayload] = useState<AutomationPayload | null>(null);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/automation', { cache: 'no-store' });
      const next = (await response.json()) as AutomationPayload;
      if (!response.ok || !next.ok || !next.shipmentTracking) {
        throw new Error(next.message ?? 'Automation status could not be loaded.');
      }
      setPayload(next);
      setEvents(next.events ?? []);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Automation status could not be loaded.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const status = payload?.shipmentTracking;
  if (!status && !error) {
    return (
      <div className="border-border/70 text-muted-foreground flex items-center gap-2 border-y py-5 text-base sm:text-sm">
        <Clock3 className="size-4 shrink-0" aria-hidden="true" />
        <p>Loading automation status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 border-y py-4 text-base sm:text-sm">
          <AlertTriangle className="stroke-destructive size-4 shrink-0" aria-hidden="true" />
          <p className="text-pretty">
            {error} The desktop supervisor will reconnect automatically.
          </p>
        </div>
      ) : null}

      {status ? (
        <>
          <section aria-labelledby="runtime-status">
            <div className="border-border/70 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div className="min-w-0">
                <h2 id="runtime-status" className="text-lg font-semibold">
                  Shipment Tracking Runtime
                </h2>
                <p className="text-muted-foreground max-w-[72ch] text-pretty text-base sm:text-sm">
                  Watches the TorqueCore queue, checks tracking pages sequentially, and stores
                  confirmed results before the admin opens them.
                </p>
              </div>
              <Badge variant={statusVariant(status.state)}>{status.state}</Badge>
            </div>

            <dl className="@container border-border/70 @md:grid-cols-3 mt-4 grid gap-0 border-y">
              <div className="@md:pr-5 py-4">
                <dt className="font-medium">Queue Reconciliation</dt>
                <dd className="text-muted-foreground text-base sm:text-sm">
                  Every <span className="tabular-nums">{status.pollMs / 1_000}</span> seconds
                </dd>
              </div>
              <div className="border-border/70 @md:border-l @md:border-t-0 @md:px-5 border-t py-4">
                <dt className="font-medium">Automatic Refresh</dt>
                <dd className="text-muted-foreground text-base sm:text-sm">
                  Every <span className="tabular-nums">{status.refreshIntervalMs / 3_600_000}</span>{' '}
                  hours
                </dd>
              </div>
              <div className="border-border/70 @md:border-l @md:border-t-0 @md:pl-5 border-t py-4">
                <dt className="font-medium">Last Queue Check</dt>
                <dd className="text-muted-foreground text-base tabular-nums sm:text-sm">
                  {formatTime(status.lastReconciledAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="active-run">
            <div className="flex items-center gap-2">
              <PackageSearch
                className="stroke-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              <h2 id="active-run" className="text-lg font-semibold">
                Current Work
              </h2>
            </div>
            {status.activeRun ? (
              <dl className="border-border/70 mt-3 grid gap-3 border-y py-4 sm:grid-cols-3">
                <div>
                  <dt className="font-medium">Run</dt>
                  <dd className="text-muted-foreground truncate font-mono text-base sm:text-sm">
                    {status.activeRun.id}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Shipment</dt>
                  <dd className="text-muted-foreground truncate font-mono text-base sm:text-sm">
                    {status.activeRun.shipmentId}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Trigger</dt>
                  <dd className="text-muted-foreground text-base capitalize sm:text-sm">
                    {status.activeRun.trigger}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="border-border/70 text-muted-foreground mt-3 text-pretty border-y py-4 text-base sm:text-sm">
                No shipment check is running. Radar is watching the queue.
              </p>
            )}
          </section>
        </>
      ) : null}

      <section aria-labelledby="recent-events">
        <div className="flex items-center gap-2">
          <Activity className="stroke-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <h2 id="recent-events" className="text-lg font-semibold">
            Recent Events
          </h2>
        </div>
        {events.length > 0 ? (
          <ol className="divide-border/70 border-border/70 mt-3 divide-y border-y" role="list">
            {[...events].reverse().map((event) => (
              <li key={event.id} className="flex items-start gap-3 py-4">
                <CheckCircle2
                  className="stroke-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{event.message}</p>
                    <Badge variant={eventVariant(event.state)}>{event.state}</Badge>
                  </div>
                  <p className="text-muted-foreground text-base tabular-nums sm:text-sm">
                    {formatTime(event.occurredAt)}
                    {event.jobId ? ` · Run ${event.jobId.slice(0, 8)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-border/70 text-muted-foreground mt-3 text-pretty border-y py-4 text-base sm:text-sm">
            No automation events yet. Queue a shipment check in TorqueCore to create the first
            event.
          </p>
        )}
      </section>
    </div>
  );
}
