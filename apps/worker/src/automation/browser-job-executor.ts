import {
  validateBrowserAutomationPayload,
  type BrowserAutomationJob,
  type BrowserAutomationJobType,
} from '@cr/shared';
import { BrowserContextManager } from './browser-context-manager.js';
import {
  applySessionStorageInit,
  loadBrowserStorageSnapshot,
  storageStateForContext,
} from '../shipments/browser-storage.js';
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
    if (callbacks.signal.aborted) throw new Error('job_cancelled');
    // Shipment checks hydrate the operator's captured browser storage (cookies +
    // localStorage + sessionStorage) so consent walls, logins and anti-bot
    // clearance cookies carry over — same snapshot the canonical run uses.
    const browserStorage =
      job.type === 'shipment_tracking'
        ? await loadBrowserStorageSnapshot(process.env.TORQUECORE_BROWSER_STORAGE_STATE_PATH)
        : null;
    const context = await this.contexts.create({
      allowHeavyResources: job.type === 'shipment_tracking',
      storageState: storageStateForContext(browserStorage),
    });
    await applySessionStorageInit(context, browserStorage);
    const closeOnAbort = () => void this.contexts.close(context);
    callbacks.signal.addEventListener('abort', closeOnAbort, { once: true });
    try {
      if (callbacks.signal.aborted) throw new Error('job_cancelled');
      return await handler({ job, browserContext: context, ...callbacks });
    } finally {
      callbacks.signal.removeEventListener('abort', closeOnAbort);
      await this.contexts.close(context);
    }
  }
}
