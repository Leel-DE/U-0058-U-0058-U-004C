import {
  validateBrowserAutomationPayload,
  type BrowserAutomationJob,
  type BrowserAutomationJobType,
} from '@cr/shared';
import { BrowserContextManager } from './browser-context-manager.js';
import type { BrowserJobHandler, BrowserJobResult, RuntimeLogEntry } from './types.js';

export class BrowserJobExecutor {
  private readonly handlers = new Map<BrowserAutomationJobType, BrowserJobHandler>();

  constructor(private readonly contexts: BrowserContextManager) {}

  register(type: BrowserAutomationJobType, handler: BrowserJobHandler) {
    if (this.handlers.has(type)) throw new Error(`duplicate_job_handler:${type}`);
    this.handlers.set(type, handler);
  }

  async execute(
    job: BrowserAutomationJob,
    callbacks: {
      log(entry: RuntimeLogEntry): Promise<void>;
      heartbeat(progress?: Record<string, unknown>): Promise<void>;
      signal: AbortSignal;
    },
  ): Promise<BrowserJobResult> {
    const payload = validateBrowserAutomationPayload(job.type, job.payload);
    job.payload = payload;
    const handler = this.handlers.get(job.type);
    if (!handler) throw new Error(`unsupported_job_type:${job.type}`);
    const context = await this.contexts.create({
      allowHeavyResources: job.type === 'shipment_tracking',
    });
    try {
      return await handler({ job, browserContext: context, ...callbacks });
    } finally {
      await this.contexts.close(context);
    }
  }
}
