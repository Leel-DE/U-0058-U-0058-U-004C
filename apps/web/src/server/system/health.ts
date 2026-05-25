import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheck {
  service: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

async function timed<T>(fn: () => Promise<T>) {
  const startedAt = Date.now();
  const data = await fn();
  return { data, latencyMs: Date.now() - startedAt };
}

function errorCheck(service: string, error: unknown): HealthCheck {
  return {
    service,
    status: 'down',
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function checkDbHealth(): Promise<HealthCheck> {
  try {
    const { data, latencyMs } = await timed(async () => {
      const [row] = await db().execute<{
        now: string;
        snapshot_hash: string | null;
        snapshot_created_at: string | null;
      }>(sql`
        select
          now()::text as now,
          (
            select snapshot_hash
            from public.schema_verification_snapshots
            order by created_at desc
            limit 1
          ) as snapshot_hash,
          (
            select created_at::text
            from public.schema_verification_snapshots
            order by created_at desc
            limit 1
          ) as snapshot_created_at
      `);
      return row;
    });
    return {
      service: 'db',
      status: data?.snapshot_hash ? 'ok' : 'degraded',
      latencyMs,
      message: data?.snapshot_hash ? 'Database reachable and verified' : 'Database reachable, no verification snapshot',
      metadata: data ?? {},
    };
  } catch (error) {
    return errorCheck('db', error);
  }
}

export async function checkWorkerHealth(): Promise<HealthCheck> {
  const env = serverEnv();
  try {
    const { data, latencyMs } = await timed(async () => {
      const res = await fetch(`${env.WORKER_URL}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      return { statusCode: res.status, body: (await res.json()) as Record<string, unknown> };
    });
    const ok = data.statusCode < 500 && data.body.ok === true;
    if (ok) {
      await db()
        .insert(schema.serviceHeartbeats)
        .values({
          service: 'worker',
          instanceId: env.WORKER_URL,
          status: 'ok',
          metadataJson: data.body,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.serviceHeartbeats.service, schema.serviceHeartbeats.instanceId],
          set: { status: 'ok', metadataJson: data.body, lastSeenAt: new Date() },
        })
        .catch(() => null);
    }
    return {
      service: 'worker',
      status: ok ? 'ok' : 'degraded',
      latencyMs,
      message: ok ? 'Worker reachable' : 'Worker returned non-ok health',
      metadata: data.body,
    };
  } catch (error) {
    return errorCheck('worker', error);
  }
}

export async function checkInngestHealth(): Promise<HealthCheck> {
  try {
    const { data, latencyMs } = await timed(async () => {
      const res = await fetch('http://127.0.0.1:8288', {
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
      return { statusCode: res.status };
    });
    return {
      service: 'inngest',
      status: data.statusCode < 500 ? 'ok' : 'degraded',
      latencyMs,
      message: 'Local Inngest endpoint reachable',
      metadata: data,
    };
  } catch (error) {
    return {
      ...errorCheck('inngest', error),
      status: 'degraded',
      message: 'Local Inngest dev server is not reachable',
    };
  }
}

export async function checkStorageHealth(): Promise<HealthCheck> {
  try {
    const { data, latencyMs } = await timed(async () => {
      const client = createSupabaseServiceRoleClient();
      const { data: buckets, error } = await client.storage.listBuckets();
      if (error) throw error;
      return buckets.map((bucket) => bucket.id);
    });
    const required = ['exports', 'raw-html', 'screenshots', 'html', 'debug'];
    const missing = required.filter((bucket) => !data.includes(bucket));
    return {
      service: 'storage',
      status: missing.length ? 'degraded' : 'ok',
      latencyMs,
      message: missing.length ? `Missing buckets: ${missing.join(', ')}` : 'Storage buckets reachable',
      metadata: { buckets: data, missing },
    };
  } catch (error) {
    return errorCheck('storage', error);
  }
}

export async function checkPlaywrightHealth(): Promise<HealthCheck> {
  const env = serverEnv();
  try {
    const { data, latencyMs } = await timed(async () => {
      const res = await fetch(`${env.WORKER_URL}/health/playwright`, {
        headers: { authorization: `Bearer ${env.WORKER_SHARED_SECRET}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      return { statusCode: res.status, body: (await res.json()) as Record<string, unknown> };
    });
    const ok = data.statusCode < 500 && data.body.ok === true;
    return {
      service: 'playwright',
      status: ok ? 'ok' : 'down',
      latencyMs,
      message: ok ? 'Browser probe launched' : 'Browser probe failed',
      metadata: data.body,
    };
  } catch (error) {
    return errorCheck('playwright', error);
  }
}

export async function checkAiHealth(): Promise<HealthCheck> {
  const env = serverEnv();
  try {
    const { data, latencyMs } = await timed(async () => {
      const res = await fetch(`${env.WORKER_URL}/ai/status`, {
        headers: { authorization: `Bearer ${env.WORKER_SHARED_SECRET}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      return { statusCode: res.status, body: (await res.json()) as Record<string, unknown> };
    });
    const enabled = data.body.enabled === true;
    return {
      service: 'ai',
      status: data.statusCode >= 500 ? 'down' : enabled ? 'ok' : 'degraded',
      latencyMs,
      message: enabled ? 'AI provider configured' : 'AI provider disabled or not configured',
      metadata: data.body,
    };
  } catch (error) {
    return errorCheck('ai', error);
  }
}

export async function getSystemHealth() {
  const checks = await Promise.all([
    checkDbHealth(),
    checkWorkerHealth(),
    checkInngestHealth(),
    checkStorageHealth(),
    checkPlaywrightHealth(),
    checkAiHealth(),
  ]);
  const status: HealthStatus = checks.some((check) => check.status === 'down')
    ? 'down'
    : checks.some((check) => check.status === 'degraded')
      ? 'degraded'
      : 'ok';
  return { status, checks, checkedAt: new Date().toISOString() };
}
