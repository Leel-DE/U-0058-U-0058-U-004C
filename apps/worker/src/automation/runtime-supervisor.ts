import { hostname } from 'node:os';
import type { BrowserAutomationJob } from '@cr/shared';
import { AdaptiveScheduler } from './adaptive-scheduler.js';
import { BrowserJobExecutor } from './browser-job-executor.js';
import {
  createCompetitorDiscoveryHandler,
  createCompetitorScrapeHandler,
} from './competition-handlers.js';
import { JobLeaseManager } from './job-lease-manager.js';
import { RuntimeLogger } from './runtime-logger.js';
import { browserContextManager, browserLauncher } from './runtime-resources.js';
import { createShipmentTrackingHandler } from './shipment-handler.js';
import { ShipmentResultStore } from './shipment-result-store.js';
import { TorqueCoreShipmentBridge } from './torquecore-bridge.js';
import { CompetitionResultStore } from './competition-result-store.js';

type RuntimeState = 'disabled' | 'starting' | 'idle' | 'running' | 'stopping' | 'error';

interface ActiveJob {
  controller: AbortController;
  orgId: string;
  type: BrowserAutomationJob['type'];
  startedAt: string;
}

const runtimeStartedAt = new Date().toISOString();

export class RuntimeSupervisor {
  private state: RuntimeState = 'disabled';
  private timer: NodeJS.Timeout | null = null;
  private lease: JobLeaseManager | null = null;
  private logger: RuntimeLogger | null = null;
  private scheduler: AdaptiveScheduler | null = null;
  private resultStore: ShipmentResultStore | null = null;
  private bridge: TorqueCoreShipmentBridge | null = null;
  private competitionResults: CompetitionResultStore | null = null;
  private readonly executor = new BrowserJobExecutor(browserContextManager);
  private readonly active = new Map<string, ActiveJob>();
  private lastError: string | null = null;
  private lastTickAt: string | null = null;
  private lastScheduleAt = 0;
  private ticking = false;
  private readonly concurrency = Math.max(
    1,
    Math.min(4, Number(process.env.AUTOMATION_CONCURRENCY ?? 4)),
  );
  private readonly pollMs = Math.max(1_000, Number(process.env.AUTOMATION_QUEUE_POLL_MS ?? 3_000));

  constructor() {
    this.executor.register('shipment_tracking', createShipmentTrackingHandler());
    this.executor.register('competitor_scrape', createCompetitorScrapeHandler());
    this.executor.register('competitor_discovery', createCompetitorDiscoveryHandler());
  }

  async start() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      this.state = 'disabled';
      this.lastError = 'Local Supabase service credentials are not configured.';
      return;
    }
    this.state = 'starting';
    const workerId = `${hostname()}:${process.pid}`;
    this.lease = new JobLeaseManager(workerId);
    this.logger = new RuntimeLogger(this.lease.client);
    this.scheduler = new AdaptiveScheduler(this.lease.client);
    this.resultStore = new ShipmentResultStore(this.lease.client);
    this.bridge = new TorqueCoreShipmentBridge(this.lease.client);
    this.competitionResults = new CompetitionResultStore(this.lease.client);
    await this.lease.recoverStale();
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref();
    this.state = 'idle';
    await this.bridge.start();
    await this.tick();
  }

  async stop() {
    this.state = 'stopping';
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.bridge?.stop();
    for (const activeJob of this.active.values()) activeJob.controller.abort();
    const deadline = Date.now() + 10_000;
    while (this.active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.state = 'disabled';
  }

  private async tick() {
    if (this.ticking || !this.lease || !this.scheduler || this.state === 'stopping') return;
    this.ticking = true;
    try {
      const now = Date.now();
      if (now - this.lastScheduleAt > 60_000) {
        await this.lease.recoverStale();
        await this.scheduler.enqueueDueShipments();
        this.lastScheduleAt = now;
      }
      while (this.active.size < this.concurrency) {
        const job = await this.lease.claim();
        if (!job) break;
        const controller = new AbortController();
        this.active.set(job.id, {
          controller,
          orgId: job.orgId,
          type: job.type,
          startedAt: new Date().toISOString(),
        });
        void this.run(job, controller);
      }
      this.state = this.active.size > 0 ? 'running' : 'idle';
      this.lastError = null;
      this.lastTickAt = new Date().toISOString();
    } catch (error) {
      this.state = 'error';
      this.lastError =
        error instanceof Error ? error.message.slice(0, 300) : 'Unknown runtime error';
    } finally {
      this.ticking = false;
    }
  }

  private async run(job: BrowserAutomationJob, controller: AbortController) {
    if (!this.lease || !this.logger) return;
    try {
      await this.logger.write(job, {
        level: 'info',
        event: 'job_started',
        message: 'Задача принята локальным Automation Hub',
        progress: 0,
      });
      const result = await this.executor.execute(job, {
        signal: controller.signal,
        heartbeat: (progress) => this.lease!.heartbeat(job, progress),
        log: (entry) => this.logger!.write(job, entry),
      });
      if (job.type === 'shipment_tracking' && this.resultStore) {
        await this.resultStore.persist(job, result.result);
        await this.bridge?.pushResult(job, result.result);
      }
      if (job.type === 'competitor_scrape')
        await this.competitionResults?.record(job, result.status === 'succeeded');
      await this.lease.complete(job, result.status, result.result);
      await this.logger.write(job, {
        level: result.status === 'awaiting_user' ? 'warn' : 'info',
        event: result.status === 'awaiting_user' ? 'manual_action_required' : 'job_completed',
        message:
          result.status === 'awaiting_user'
            ? 'Задача ожидает ручного прохождения CAPTCHA'
            : 'Задача завершена',
        progress: result.status === 'awaiting_user' ? 90 : 100,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        await this.lease.cancel(job).catch(() => undefined);
        await this.logger
          .write(job, {
            level: 'warn',
            event: 'job_cancelled',
            message: 'Job stopped by an operator.',
          })
          .catch(() => undefined);
        return;
      }
      if (job.type === 'competitor_scrape' && job.attemptCount >= job.maxAttempts) {
        await this.competitionResults?.record(job, false).catch(() => undefined);
      }
      await this.logger
        .write(job, {
          level: 'error',
          event: 'job_failed',
          message: error instanceof Error ? error.message : 'Unknown worker error',
        })
        .catch(() => undefined);
      await this.lease.fail(job, error).catch(() => undefined);
    } finally {
      this.active.delete(job.id);
      void this.tick();
    }
  }

  status() {
    const memory = process.memoryUsage();
    return {
      enabled: this.state !== 'disabled',
      state: this.state,
      activeJobs: [...this.active.keys()],
      activeJobDetails: [...this.active.entries()].map(([id, activeJob]) => ({
        id,
        orgId: activeJob.orgId,
        type: activeJob.type,
        startedAt: activeJob.startedAt,
      })),
      concurrency: this.concurrency,
      pollMs: this.pollMs,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      process: {
        pid: process.pid,
        startedAt: runtimeStartedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: memory.rss,
      },
      browser: { ...browserLauncher.status(), ...browserContextManager.status() },
      torqueCoreBridge: this.bridge?.status() ?? { enabled: false },
    };
  }

  async cancel(input: { orgId: string; jobIds?: string[] }) {
    const requestedIds = input.jobIds ? new Set(input.jobIds) : null;
    const cancelled: string[] = [];
    for (const [jobId, activeJob] of this.active) {
      if (activeJob.orgId !== input.orgId) continue;
      if (requestedIds && !requestedIds.has(jobId)) continue;
      activeJob.controller.abort();
      cancelled.push(jobId);
    }
    return { cancelled };
  }

  async events(orgId: string, limit = 100, after?: string) {
    if (!this.lease) return [];
    let query = this.lease.client
      .from('automation_job_events')
      .select('id, job_id, level, event, message, progress, metadata_json, created_at')
      .eq('org_id', orgId)
      .order('id', { ascending: after ? true : false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    return after ? (data ?? []) : [...(data ?? [])].reverse();
  }
}

export const automationRuntimeSupervisor = new RuntimeSupervisor();
