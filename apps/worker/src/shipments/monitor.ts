import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

import {
  emitAutomationEvent,
  listAutomationEvents,
  type AutomationEvent,
} from '../automation/events.js';
import { runShipmentTracking, type ShipmentTrackingRunOutcome } from './run.js';

type MonitorState = 'disabled' | 'starting' | 'idle' | 'running' | 'stopping' | 'error';

interface QueuedRun {
  id: string;
  shipment_id: string;
  trigger: 'manual' | 'schedule';
  created_at: string;
}

interface LatestRun {
  shipment_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  created_at: string;
  completed_at: string | null;
}

interface ShipmentRow {
  id: string;
}

function duration(name: string, fallback: number, minimum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'Unknown error';
}

const config = {
  url: process.env.TORQUECORE_SUPABASE_URL?.trim() ?? '',
  serviceRoleKey: process.env.TORQUECORE_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  pollMs: duration('TORQUECORE_SHIPMENT_QUEUE_POLL_MS', 5_000, 1_000),
  scheduleScanMs: duration('TORQUECORE_SHIPMENT_SCHEDULE_SCAN_MS', 60_000, 10_000),
  refreshIntervalMs: duration('TORQUECORE_SHIPMENT_REFRESH_INTERVAL_MS', 21_600_000, 60_000),
  staleRunningMs: duration('TORQUECORE_SHIPMENT_STALE_RUNNING_MS', 1_200_000, 60_000),
};

/**
 * The TorqueCore run queue must have exactly ONE consumer. When the
 * Automation-Hub bridge is configured (TORQUECORE_AUTOMATION_ORG_ID), it
 * mirrors queued runs into the local durable queue and owns their execution —
 * running this canonical monitor alongside it doubles every check and floods
 * the job list. The monitor therefore only starts when the bridge is not
 * configured, unless TORQUECORE_CANONICAL_MONITOR=true forces it on.
 */
export function shouldRunCanonicalShipmentMonitor(env: {
  TORQUECORE_SUPABASE_URL?: string;
  TORQUECORE_SUPABASE_SERVICE_ROLE_KEY?: string;
  TORQUECORE_AUTOMATION_ORG_ID?: string;
  TORQUECORE_CANONICAL_MONITOR?: string;
}): boolean {
  const hasCredentials = Boolean(
    env.TORQUECORE_SUPABASE_URL?.trim() && env.TORQUECORE_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  if (!hasCredentials) return false;
  if (env.TORQUECORE_CANONICAL_MONITOR?.trim().toLowerCase() === 'true') return true;
  const bridgeConfigured = Boolean(env.TORQUECORE_AUTOMATION_ORG_ID?.trim());
  return !bridgeConfigured;
}

export class ShipmentTrackingMonitor {
  private readonly enabled = Boolean(config.url && config.serviceRoleKey);
  private readonly client = this.enabled
    ? createClient(config.url, config.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      })
    : null;
  private state: MonitorState = this.enabled ? 'starting' : 'disabled';
  private timer: NodeJS.Timeout | null = null;
  private channel: RealtimeChannel | null = null;
  private reconciling = false;
  private stopRequested = false;
  private lastScheduleScanAt = 0;
  private activeRun: QueuedRun | null = null;
  private lastOutcome: ShipmentTrackingRunOutcome | null = null;
  private lastError: string | null = null;
  private lastReconciledAt: string | null = null;

  status() {
    return {
      enabled: this.enabled,
      state: this.state,
      activeRun: this.activeRun
        ? {
            id: this.activeRun.id,
            shipmentId: this.activeRun.shipment_id,
            trigger: this.activeRun.trigger,
          }
        : null,
      lastOutcome: this.lastOutcome,
      lastError: this.lastError,
      lastReconciledAt: this.lastReconciledAt,
      pollMs: config.pollMs,
      scheduleScanMs: config.scheduleScanMs,
      refreshIntervalMs: config.refreshIntervalMs,
      recentEvents: listAutomationEvents({ limit: 10 }),
    };
  }

  health() {
    return {
      enabled: this.enabled,
      state: this.state,
      active: Boolean(this.activeRun),
      lastReconciledAt: this.lastReconciledAt,
      hasError: Boolean(this.lastError),
    };
  }

  events(input?: { after?: string; limit?: number }): AutomationEvent[] {
    return listAutomationEvents(input);
  }

  async start(): Promise<void> {
    if (!this.enabled || !this.client) {
      this.state = 'disabled';
      emitAutomationEvent({
        jobType: 'shipment_tracking',
        event: 'monitor_disabled',
        state: 'info',
        message:
          'Shipment monitor is disabled until TorqueCore Supabase credentials are configured.',
      });
      return;
    }

    this.stopRequested = false;
    this.state = 'starting';
    this.channel = this.client
      .channel('competition-radar-shipment-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shipment_tracking_runs',
        },
        () => {
          void this.reconcile('realtime');
        },
      )
      .subscribe();

    this.timer = setInterval(() => {
      void this.reconcile('poll');
    }, config.pollMs);
    this.timer.unref();
    this.state = 'idle';
    emitAutomationEvent({
      jobType: 'shipment_tracking',
      event: 'monitor_started',
      state: 'info',
      message: 'Shipment monitor is online.',
      metadata: {
        pollMs: config.pollMs,
        scheduleScanMs: config.scheduleScanMs,
        refreshIntervalMs: config.refreshIntervalMs,
      },
    });
    await this.reconcile('startup');
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.state = 'stopping';
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.channel) await this.channel.unsubscribe();
    this.channel = null;
    this.state = this.enabled ? 'idle' : 'disabled';
  }

  private async reconcile(source: 'startup' | 'poll' | 'realtime') {
    if (!this.client || this.reconciling || this.stopRequested || this.activeRun) {
      return;
    }
    this.reconciling = true;
    try {
      await this.recoverStaleRuns();
      const now = Date.now();
      if (now - this.lastScheduleScanAt >= config.scheduleScanMs) {
        await this.queueDueShipments();
        this.lastScheduleScanAt = now;
      }
      const run = await this.claimNextRun();
      this.lastReconciledAt = new Date().toISOString();
      this.lastError = null;
      if (!run) {
        this.state = 'idle';
        return;
      }
      await this.processRun(run);
    } catch (error) {
      this.lastError = errorMessage(error);
      this.state = 'error';
      emitAutomationEvent({
        jobType: 'shipment_tracking',
        event: 'monitor_error',
        state: 'failed',
        message: 'Shipment queue reconciliation failed.',
        metadata: { source, error: this.lastError },
      });
    } finally {
      this.reconciling = false;
    }

    if (!this.stopRequested) {
      setImmediate(() => void this.reconcile('poll'));
    }
  }

  private async recoverStaleRuns(): Promise<void> {
    if (!this.client) return;
    const cutoff = new Date(Date.now() - config.staleRunningMs).toISOString();
    const { data, error } = await this.client
      .from('shipment_tracking_runs')
      .update({
        status: 'queued',
        started_at: null,
        error_summary: 'Recovered after the previous worker stopped.',
      })
      .eq('status', 'running')
      .lt('started_at', cutoff)
      .select('id, shipment_id');
    if (error) throw error;
    for (const recovered of data ?? []) {
      emitAutomationEvent({
        jobType: 'shipment_tracking',
        event: 'run_recovered',
        state: 'recovering',
        message: 'A stale shipment check was returned to the queue.',
        jobId: String(recovered.id),
        subjectId: String(recovered.shipment_id),
      });
    }
  }

  private async queueDueShipments(): Promise<void> {
    if (!this.client) return;
    const { data: shipments, error: shipmentError } = await this.client
      .from('shipments')
      .select('id')
      .eq('tracking_enabled', true)
      .not('current_status', 'in', '(delivered,returned,cancelled)')
      .limit(100);
    if (shipmentError) throw shipmentError;
    const shipmentRows = (shipments ?? []) as ShipmentRow[];
    if (shipmentRows.length === 0) return;

    const shipmentIds = shipmentRows.map((shipment) => shipment.id);
    const { data: runs, error: runError } = await this.client
      .from('shipment_tracking_runs')
      .select('shipment_id, status, created_at, completed_at')
      .in('shipment_id', shipmentIds)
      .order('created_at', { ascending: false })
      .limit(500);
    if (runError) throw runError;

    const latest = new Map<string, LatestRun>();
    for (const run of (runs ?? []) as LatestRun[]) {
      if (!latest.has(run.shipment_id)) latest.set(run.shipment_id, run);
    }

    const cutoff = Date.now() - config.refreshIntervalMs;
    const due = shipmentRows
      .filter((shipment) => {
        const run = latest.get(shipment.id);
        if (!run) return true;
        if (run.status === 'queued' || run.status === 'running') return false;
        const lastAt = new Date(run.completed_at ?? run.created_at).getTime();
        return Number.isNaN(lastAt) || lastAt <= cutoff;
      })
      .slice(0, 10);

    for (const shipment of due) {
      const { data, error } = await this.client
        .from('shipment_tracking_runs')
        .insert({
          shipment_id: shipment.id,
          trigger: 'schedule',
          status: 'queued',
        })
        .select('id')
        .maybeSingle();
      if (error?.code === '23505') continue;
      if (error) throw error;
      if (data) {
        emitAutomationEvent({
          jobType: 'shipment_tracking',
          event: 'run_queued',
          state: 'queued',
          message: 'Scheduled shipment check queued.',
          jobId: String(data.id),
          subjectId: shipment.id,
        });
      }
    }
  }

  private async claimNextRun(): Promise<QueuedRun | null> {
    if (!this.client) return null;
    const { data: candidate, error: selectError } = await this.client
      .from('shipment_tracking_runs')
      .select('id, shipment_id, trigger, created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selectError) throw selectError;
    if (!candidate) return null;

    const { data: claimed, error: claimError } = await this.client
      .from('shipment_tracking_runs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        error_summary: null,
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select('id, shipment_id, trigger, created_at')
      .maybeSingle();
    if (claimError) throw claimError;
    return claimed ? (claimed as QueuedRun) : null;
  }

  private async processRun(run: QueuedRun): Promise<void> {
    if (!this.client) return;
    this.activeRun = run;
    this.state = 'running';
    emitAutomationEvent({
      jobType: 'shipment_tracking',
      event: 'run_started',
      state: 'running',
      message: 'Browser shipment check started.',
      jobId: run.id,
      subjectId: run.shipment_id,
      metadata: { trigger: run.trigger },
    });

    try {
      const outcome = await runShipmentTracking({
        shipmentId: run.shipment_id,
        runId: run.id,
        onProgress: (progress) => {
          const progressState =
            progress.sourceState === 'success'
              ? 'running'
              : progress.sourceState
                ? 'partial'
                : 'running';
          emitAutomationEvent({
            jobType: 'shipment_tracking',
            event: progress.event,
            state: progressState,
            message: progress.message,
            jobId: run.id,
            subjectId: run.shipment_id,
            metadata: {
              source: progress.source ?? null,
              sourceState: progress.sourceState ?? null,
            },
          });
        },
      });
      this.lastOutcome = outcome;
      this.state = 'idle';
      emitAutomationEvent({
        jobType: 'shipment_tracking',
        event: 'run_completed',
        state: outcome.status,
        message: 'Browser shipment check completed.',
        jobId: run.id,
        subjectId: run.shipment_id,
        metadata: {
          status: outcome.status,
          successfulSources: outcome.successfulSources,
          presentationGenerated: outcome.presentationGenerated,
          telegramDelivered: outcome.telegramDelivered,
        },
      });
    } catch (error) {
      const message = errorMessage(error);
      this.lastError = message;
      this.state = 'error';
      await this.client
        .from('shipment_tracking_runs')
        .update({
          status: 'failed',
          error_summary: 'Competition Radar shipment worker failed.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .eq('shipment_id', run.shipment_id);
      emitAutomationEvent({
        jobType: 'shipment_tracking',
        event: 'run_failed',
        state: 'failed',
        message: 'Browser shipment check failed.',
        jobId: run.id,
        subjectId: run.shipment_id,
        metadata: { error: message },
      });
    } finally {
      this.activeRun = null;
    }
  }
}

export const shipmentTrackingMonitor = new ShipmentTrackingMonitor();
