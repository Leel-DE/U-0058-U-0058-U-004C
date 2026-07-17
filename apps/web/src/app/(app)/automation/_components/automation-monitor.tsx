'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock3, ListTodo, ServerCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueueControls, CancelJobControl } from './job-controls';

interface RuntimeStatus {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'idle' | 'running' | 'stopping' | 'error';
  activeJobs: string[];
  activeJobDetails: Array<{ id: string; type: string; startedAt: string }>;
  concurrency: number;
  pollMs: number;
  lastTickAt: string | null;
  lastError: string | null;
  process: {
    pid: number;
    startedAt: string;
    uptimeSeconds: number;
    memoryRssBytes: number;
  };
  browser: { connected: boolean; mode: string; activeContexts: number };
  torqueCoreBridge: { enabled: boolean; lastSyncAt?: string | null; lastError?: string | null };
}

interface RuntimeEvent {
  id: string;
  job_id: string;
  level: string;
  event: string;
  message: string;
  progress: number | null;
  created_at: string;
}

interface QueueJob {
  id: string;
  type: string;
  status: string;
  priority: string;
  progress: number;
  scheduledAt: string;
  startedAt: string | null;
  createdAt: string;
  attemptCount: number;
  maxAttempts: number;
}

interface QueueState {
  jobs: QueueJob[];
  counts: Record<string, number>;
  activeCount: number;
  totalCount: number;
}

interface WebProcess {
  pid: number;
  uptimeSeconds: number;
  memoryRssBytes: number;
}

interface Payload {
  ok: boolean;
  automationHub?: RuntimeStatus;
  events?: RuntimeEvent[];
  queue?: QueueState;
  webProcess?: WebProcess;
  automationPolicy?: {
    enabled: boolean;
    competitorIntervalMinutes: number;
    maxConcurrentJobs: number;
    nextCompetitorRunAt: string | null;
  };
  message?: string;
}

function formatTime(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(
        new Date(value),
      )
    : 'Not reported yet';
}

function formatDuration(seconds?: number) {
  if (seconds == null) return 'Unknown';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
}

function formatMemory(bytes?: number) {
  return bytes == null ? 'Unknown' : `${Math.round(bytes / 1024 / 1024)} MB`;
}

function statusVariant(status: string) {
  if (status === 'running' || status === 'online' || status === 'connected')
    return 'success' as const;
  if (status === 'queued' || status === 'starting' || status === 'awaiting_user')
    return 'warning' as const;
  if (status === 'error' || status === 'offline') return 'destructive' as const;
  return 'secondary' as const;
}

export function AutomationMonitor({
  canStop,
  canDelete,
}: {
  canStop: boolean;
  canDelete: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/automation', { cache: 'no-store' });
      const next = (await response.json()) as Payload;
      setPayload(next);
      setError(next.ok ? null : (next.message ?? 'Automation worker is unavailable.'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Runtime status is unavailable.');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!payload && !error)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-base sm:text-sm">
        <Clock3 className="size-4 shrink-0 animate-pulse" />
        Loading runtime and queue state...
      </p>
    );

  const runtime = payload?.automationHub;
  const queue = payload?.queue;
  const policy = payload?.automationPolicy;
  const running = Number(queue?.counts.running ?? 0);
  const queued = Number(queue?.counts.queued ?? 0);
  const waiting = Number(queue?.counts.awaiting_user ?? 0);

  return (
    <div className="space-y-8">
      {error ? (
        <div className="border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-md border p-4 text-base sm:text-sm">
          <AlertTriangle className="text-destructive size-4 shrink-0" />
          <p className="text-pretty">
            {error} Queue records below remain available. Retrying every three seconds.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="automation-summary-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="automation-summary-title" className="text-xl font-semibold">
              Live Operations
            </h2>
            <p className="text-muted-foreground text-pretty text-base sm:text-sm">
              Current process health and durable queue state. Updated every three seconds.
            </p>
          </div>
          {queue ? (
            <QueueControls
              activeCount={queue.activeCount}
              totalCount={queue.totalCount}
              canStop={canStop}
              canDelete={canDelete}
              automationEnabled={policy?.enabled ?? true}
              onChanged={refresh}
            />
          ) : null}
        </div>

        <dl className="grid gap-y-4 border-y py-4 sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-5">
          <div>
            <dt className="truncate font-medium">Runtime State</dt>
            <dd className="text-muted-foreground pt-1">
              <Badge
                variant={statusVariant(
                  policy?.enabled === false ? 'paused' : (runtime?.state ?? 'offline'),
                )}
              >
                {policy?.enabled === false ? 'paused' : (runtime?.state ?? 'offline')}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="truncate font-medium">Running Jobs</dt>
            <dd className="text-muted-foreground pt-1 text-2xl font-semibold tabular-nums">
              {running}/{policy?.maxConcurrentJobs ?? runtime?.concurrency ?? 0}
            </dd>
          </div>
          <div>
            <dt className="truncate font-medium">Queued Jobs</dt>
            <dd className="text-muted-foreground pt-1 text-2xl font-semibold tabular-nums">
              {queued}
            </dd>
          </div>
          <div>
            <dt className="truncate font-medium">Waiting For Input</dt>
            <dd className="text-muted-foreground pt-1 text-2xl font-semibold tabular-nums">
              {waiting}
            </dd>
          </div>
          <div>
            <dt className="truncate font-medium">Next Competitor Run</dt>
            <dd className="text-muted-foreground pt-1 text-base font-semibold sm:text-sm">
              {policy?.enabled === false ? 'Paused' : formatTime(policy?.nextCompetitorRunAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="processes-title" className="space-y-3">
        <div className="flex items-start gap-2">
          <ServerCog className="size-4 shrink-0" />
          <div className="min-w-0">
            <h2 id="processes-title" className="font-semibold">
              Processes
            </h2>
            <p className="text-muted-foreground text-pretty text-base sm:text-sm">
              Services owned by the local Automation Hub session.
            </p>
          </div>
        </div>
        <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
            <table className="w-full text-left text-base sm:text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">Process</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">State</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">PID / Mode</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Uptime / Activity</th>
                  <th className="whitespace-nowrap py-2 pl-4 font-medium">Memory / Details</th>
                </tr>
              </thead>
              <tbody>
                <ProcessRow
                  name="Web Control Plane"
                  status="online"
                  identity={
                    payload?.webProcess ? `PID ${payload.webProcess.pid}` : 'Current session'
                  }
                  activity={formatDuration(payload?.webProcess?.uptimeSeconds)}
                  detail={formatMemory(payload?.webProcess?.memoryRssBytes)}
                />
                <ProcessRow
                  name="Automation Worker"
                  status={runtime?.state ?? 'offline'}
                  identity={runtime?.process ? `PID ${runtime.process.pid}` : 'Unavailable'}
                  activity={formatDuration(runtime?.process?.uptimeSeconds)}
                  detail={formatMemory(runtime?.process?.memoryRssBytes)}
                />
                <ProcessRow
                  name="Playwright Browser"
                  status={runtime?.browser.connected ? 'connected' : 'standby'}
                  identity={runtime?.browser.mode ?? 'Unknown'}
                  activity={`${runtime?.browser.activeContexts ?? 0} active contexts`}
                  detail={
                    runtime?.browser.connected ? 'Ready for browser jobs' : 'Starts on demand'
                  }
                />
                <ProcessRow
                  name="TorqueCore Bridge"
                  status={runtime?.torqueCoreBridge.enabled ? 'connected' : 'standby'}
                  identity="Shipment sync"
                  activity={formatTime(runtime?.torqueCoreBridge.lastSyncAt)}
                  detail={runtime?.torqueCoreBridge.lastError ?? 'Optional integration'}
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="queue-title" className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <ListTodo className="size-4 shrink-0" />
            <div className="min-w-0">
              <h2 id="queue-title" className="font-semibold">
                Active Queue
              </h2>
              <p className="text-muted-foreground text-pretty text-base sm:text-sm">
                Running, queued, and CAPTCHA-paused jobs in execution order. Showing up to 25.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/jobs">View All Jobs</Link>
          </Button>
        </div>
        {queue?.jobs.length ? (
          <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
              <table className="w-full text-left text-base sm:text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="whitespace-nowrap py-2 pr-4 font-medium">Job</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">State</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">Progress</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">Attempts</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">Scheduled</th>
                    <th className="whitespace-nowrap py-2 pl-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                          {job.type.replaceAll('_', ' ')}
                        </Link>
                        <p className="text-muted-foreground font-mono">{job.id.slice(0, 12)}...</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{job.progress}%</td>
                      <td className="px-4 py-3 tabular-nums">
                        {job.attemptCount}/{job.maxAttempts}
                      </td>
                      <td className="text-muted-foreground px-4 py-3">
                        {formatTime(job.scheduledAt)}
                      </td>
                      <td className="py-3 pl-4">
                        {canStop ? <CancelJobControl jobId={job.id} onChanged={refresh} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-pretty border-t pt-4 text-base sm:text-sm">
            {policy?.enabled === false
              ? 'No active jobs. Scheduled work remains paused until automation is resumed.'
              : 'No active jobs. New shipment checks and competitor scans will appear here when queued.'}
          </p>
        )}
      </section>

      <section aria-labelledby="events-title" className="space-y-3">
        <div className="flex items-start gap-2">
          <Activity className="size-4 shrink-0" />
          <div>
            <h2 id="events-title" className="font-semibold">
              Recent Events
            </h2>
            <p className="text-muted-foreground text-pretty text-base sm:text-sm">
              Latest progress reported by the worker for this organization.
            </p>
          </div>
        </div>
        {payload?.events?.length ? (
          <ol className="divide-border divide-y" role="list">
            {[...payload.events].reverse().map((event) => (
              <li key={event.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{event.message}</p>
                  <p className="text-muted-foreground shrink-0 tabular-nums">
                    {event.progress ?? 0}%
                  </p>
                </div>
                <p className="text-muted-foreground text-base sm:text-sm">
                  {event.event} · {formatTime(event.created_at)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-pretty border-t pt-4 text-base sm:text-sm">
            No events yet. The timeline will populate when the first job starts.
          </p>
        )}
      </section>
    </div>
  );
}

function ProcessRow({
  name,
  status,
  identity,
  activity,
  detail,
}: {
  name: string;
  status: string;
  identity: string;
  activity: string;
  detail: string;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4 font-medium">{name}</td>
      <td className="px-4 py-3">
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </td>
      <td className="px-4 py-3 font-mono">{identity}</td>
      <td className="text-muted-foreground px-4 py-3 tabular-nums">{activity}</td>
      <td className="text-muted-foreground py-3 pl-4">{detail}</td>
    </tr>
  );
}
