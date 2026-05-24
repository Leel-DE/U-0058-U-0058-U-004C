'use server';

import { and, eq } from 'drizzle-orm';
import { schemas, USER_AGENT } from '@cr/shared';
import type { ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { serverEnv } from '@/lib/env';

/**
 * Invoke the worker synchronously for one URL and return the extracted
 * payload (or an error code) — used by the selector tester UI.
 */
export const testScrapeUrl = defineAction(
  schemas.testScrapeSchema,
  async (input, ctx): Promise<ScrapeResponse> => {
    const env = serverEnv();
    const rows = await db()
      .select({
        store: schema.stores,
        rules: schema.scrapingRules,
      })
      .from(schema.stores)
      .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error('Store not found');
    const { store, rules } = row;

    const payload = {
      url: input.url,
      strategy: store.jsRequired ? ('playwright' as const) : ('cheerio' as const),
      rules: {
        titleSelector: rules?.titleSelector ?? null,
        priceSelector: rules?.priceSelector ?? null,
        oldPriceSelector: rules?.oldPriceSelector ?? null,
        availabilitySelector: rules?.availabilitySelector ?? null,
        imageSelector: rules?.imageSelector ?? null,
        shippingSelector: rules?.shippingSelector ?? null,
        ratingSelector: rules?.ratingSelector ?? null,
        priceRegex: rules?.priceRegex ?? null,
        useJsonLd: rules?.useJsonLd ?? true,
        useOpenGraph: rules?.useOpenGraph ?? true,
      },
      respectRobots: store.respectRobots,
      userAgent: USER_AGENT,
      timeoutMs: 20_000,
    };

    const res = await fetch(`${env.WORKER_URL}/scrape`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });

    const json = (await res.json()) as ScrapeResponse;
    return json;
  },
  { roles: ['owner', 'manager'] },
);

async function loadStoreForWorker(storeId: string, orgId: string) {
  const rows = await db()
    .select({
      store: schema.stores,
      rules: schema.scrapingRules,
    })
    .from(schema.stores)
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.orgId, orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error('Store not found');
  return row;
}

function rulesPayload(rules: typeof schema.scrapingRules.$inferSelect | null) {
  return {
    titleSelector: rules?.titleSelector ?? null,
    priceSelector: rules?.priceSelector ?? null,
    oldPriceSelector: rules?.oldPriceSelector ?? null,
    availabilitySelector: rules?.availabilitySelector ?? null,
    imageSelector: rules?.imageSelector ?? null,
    shippingSelector: rules?.shippingSelector ?? null,
    ratingSelector: rules?.ratingSelector ?? null,
    priceRegex: rules?.priceRegex ?? null,
    useJsonLd: rules?.useJsonLd ?? true,
    useOpenGraph: rules?.useOpenGraph ?? true,
  };
}

export const autoDetectScrapeUrl = defineAction(
  schemas.autoDetectScrapeSchema,
  async (input, ctx) => {
    const env = serverEnv();
    const { store } = await loadStoreForWorker(input.storeId, ctx.orgId);
    const res = await fetch(`${env.WORKER_URL}/scrape/auto-detect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        url: input.url,
        pageType: input.pageType,
        strategy: store.jsRequired ? 'playwright' : 'auto',
        respectRobots: store.respectRobots,
        userAgent: USER_AGENT,
        timeoutMs: 45_000,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.ok && json.suggestion && json.cleanedDomHash) {
      await db().insert(schema.aiExtractionSuggestions).values({
        orgId: ctx.orgId,
        competitorId: input.storeId,
        url: input.url,
        cleanedDomHash: String(json.cleanedDomHash),
        suggestedRulesJson: json.suggestion,
        confidence: String((json.suggestion as { confidence?: number }).confidence ?? 0),
        status: 'suggested',
      });
    }
    return json;
  },
  { roles: ['owner', 'manager'] },
);

export const startManualBrowser = defineAction(
  schemas.manualSessionStartSchema,
  async (input, ctx) => {
    const env = serverEnv();
    const { rules } = await loadStoreForWorker(input.storeId, ctx.orgId);
    const res = await fetch(`${env.WORKER_URL}/scrape/manual-session/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        url: input.url,
        userAgent: USER_AGENT,
        rules: rulesPayload(rules),
        timeoutMs: 90_000,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    return (await res.json()) as Record<string, unknown>;
  },
  { roles: ['owner', 'manager'] },
);

export const continueManualBrowser = defineAction(
  schemas.manualSessionContinueSchema,
  async (input, ctx) => {
    const env = serverEnv();
    const { rules } = await loadStoreForWorker(input.storeId, ctx.orgId);
    const res = await fetch(`${env.WORKER_URL}/scrape/manual-session/continue`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: input.sessionId,
        rules: rulesPayload(rules),
        timeoutMs: 30_000,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    return (await res.json()) as Record<string, unknown>;
  },
  { roles: ['owner', 'manager'] },
);

// ===========================================================================
// Manual browser session lifecycle controls (added by browser-session-manager)
// ===========================================================================

import { z } from 'zod';

async function workerPost<T>(path: string, body: unknown): Promise<T> {
  const env = serverEnv();
  const res = await fetch(`${env.WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return (await res.json()) as T;
}

async function workerGet<T>(path: string): Promise<T> {
  const env = serverEnv();
  const res = await fetch(`${env.WORKER_URL}${path}`, {
    headers: { authorization: `Bearer ${env.WORKER_SHARED_SECRET}` },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  return (await res.json()) as T;
}

const sessionIdSchema = z.object({ sessionId: z.string().uuid() });
const keepOpenSchema = z.object({ sessionId: z.string().uuid(), keepOpen: z.boolean() });

export const setManualKeepOpen = defineAction(
  keepOpenSchema,
  async (input) =>
    workerPost<Record<string, unknown>>('/scrape/manual-session/keep-open', input),
  { roles: ['owner', 'manager'] },
);

export const closeManualBrowserNow = defineAction(
  sessionIdSchema,
  async (input) =>
    workerPost<Record<string, unknown>>('/scrape/manual-session/close-now', input),
  { roles: ['owner', 'manager'] },
);

export const reopenManualBrowser = defineAction(
  sessionIdSchema,
  async (input) =>
    workerPost<Record<string, unknown>>('/scrape/manual-session/reopen', input),
  { roles: ['owner', 'manager'] },
);

export const completeManualBrowser = defineAction(
  sessionIdSchema.extend({ note: z.string().max(500).optional() }),
  async (input) =>
    workerPost<Record<string, unknown>>('/scrape/manual-session/complete', input),
  { roles: ['owner', 'manager'] },
);

export const refreshManualSession = defineAction(
  sessionIdSchema,
  async (input) =>
    workerGet<Record<string, unknown>>(`/scrape/manual-session/${input.sessionId}/status`),
  { roles: ['owner', 'manager', 'viewer'] },
);

export async function getAiWorkerStatus() {
  const env = serverEnv();
  try {
    const res = await fetch(`${env.WORKER_URL}/ai/status`, {
      headers: { authorization: `Bearer ${env.WORKER_SHARED_SECRET}` },
      next: { revalidate: 15 },
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, enabled: false, error: (err as Error).message };
  }
}
