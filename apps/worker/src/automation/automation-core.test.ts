import { describe, expect, it, vi } from 'vitest';
import {
  shipmentTrackingPayloadSchema,
  validateBrowserAutomationPayload,
  type BrowserAutomationJob,
} from '@cr/shared';
import { nextShipmentCheck } from './adaptive-scheduler.js';
import { ReportBuilder, RetryManager } from './services.js';
import { assertPublicHttpUrl } from './url-policy.js';
import { shipmentAdapters } from './shipment-adapters.js';
import { BrowserJobExecutor } from './browser-job-executor.js';
import type { BrowserContextManager } from './browser-context-manager.js';

describe('strict browser job envelope', () => {
  it('rejects unknown job types instead of resolving arbitrary handlers', () => {
    expect(() => validateBrowserAutomationPayload('shell' as never, {})).toThrow();
  });

  it('rejects tracking values that could carry script or URL payloads', () => {
    expect(
      shipmentTrackingPayloadSchema.safeParse({
        inputVersion: 1,
        shipmentId: crypto.randomUUID(),
        trackingNumber: 'ABC<script>',
      }).success,
    ).toBe(false);
    expect(
      shipmentTrackingPayloadSchema.safeParse({
        inputVersion: 1,
        shipmentId: crypto.randomUUID(),
        trackingNumber: 'https://127.0.0.1/admin',
      }).success,
    ).toBe(false);
  });

  it('strips unknown executable fields from an otherwise valid payload', () => {
    const value = shipmentTrackingPayloadSchema.parse({
      inputVersion: 1,
      shipmentId: crypto.randomUUID(),
      trackingNumber: 'YT2515000703892426',
      shell: 'rm -rf /',
      handler: 'custom',
      javascript: 'document.cookie',
    });
    expect(value).not.toHaveProperty('shell');
    expect(value).not.toHaveProperty('handler');
    expect(value).not.toHaveProperty('javascript');
  });
});

describe('adaptive scheduling', () => {
  it('checks out-for-delivery parcels more frequently than registered parcels', () => {
    expect(nextShipmentCheck('out_for_delivery').minutes).toBeLessThan(
      nextShipmentCheck('info_received').minutes,
    );
  });

  it('stops hot-looping terminal statuses', () => {
    expect(nextShipmentCheck('delivered').minutes).toBe(10_080);
    expect(nextShipmentCheck('returned').minutes).toBe(10_080);
  });
});

describe('browser source policy', () => {
  it('builds only fixed HTTPS provider URLs with encoded tracking numbers', () => {
    for (const adapter of shipmentAdapters) {
      const url = adapter.buildUrl('YT 123');
      expect(url.protocol).toBe('https:');
      expect(
        [
          'ups.com',
          'postal.ninja',
          'parcelsapp.com',
          'ship24.com',
          '17track.net',
          'yw56.com.cn',
        ].some((domain) => url.hostname.endsWith(domain)),
      ).toBe(true);
    }
  });

  it('blocks localhost and private network targets', async () => {
    await expect(assertPublicHttpUrl('http://localhost:54321')).rejects.toThrow(
      'unsafe_target_url',
    );
    await expect(assertPublicHttpUrl('http://127.0.0.1/admin')).rejects.toThrow(
      'unsafe_target_url',
    );
  });
});

describe('reliability helpers', () => {
  it('retries transient failures within a bounded budget', async () => {
    let attempts = 0;
    const value = await new RetryManager().run(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary');
        return 'ok';
      },
      { attempts: 3, baseDelayMs: 1 },
    );
    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('creates stable event hashes for idempotent persistence', () => {
    const report = new ReportBuilder();
    expect(report.eventHash(['shipment', 'in_transit', 'Berlin'])).toBe(
      report.eventHash(['shipment', 'in_transit', 'Berlin']),
    );
    expect(report.eventHash(['shipment', 'delivered'])).not.toBe(
      report.eventHash(['shipment', 'in_transit']),
    );
  });
});

describe('operator cancellation', () => {
  it('closes the isolated browser context when a running job is aborted', async () => {
    const close = vi.fn(async () => undefined);
    const contexts = {
      create: vi.fn(async () => ({})),
      close,
    } as unknown as BrowserContextManager;
    const executor = new BrowserJobExecutor(contexts);
    executor.register('shipment_tracking', async ({ signal }) => {
      await new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('job_cancelled')), { once: true });
      });
      throw new Error('unreachable');
    });
    const controller = new AbortController();
    const job: BrowserAutomationJob = {
      id: crypto.randomUUID(),
      orgId: crypto.randomUUID(),
      type: 'shipment_tracking',
      priority: 'normal',
      status: 'running',
      payload: {
        inputVersion: 1,
        shipmentId: crypto.randomUUID(),
        trackingNumber: '1Z0R6D896828244757',
        manualContinuation: true,
      },
      attemptCount: 1,
      maxAttempts: 3,
      leaseToken: crypto.randomUUID(),
      inputVersion: 1,
    };

    const execution = executor.execute(job, {
      signal: controller.signal,
      heartbeat: async () => undefined,
      log: async () => undefined,
    });
    await Promise.resolve();
    controller.abort();

    await expect(execution).rejects.toThrow('job_cancelled');
    expect(close).toHaveBeenCalled();
  });
});
