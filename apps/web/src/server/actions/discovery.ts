'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { schemas, USER_AGENT } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { serverEnv } from '@/lib/env';
import { getContext } from '@/lib/auth';

type WorkerJson = Record<string, unknown>;

function urlHash(url: string) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function serializeRunStatus(value: WorkerJson | null | undefined) {
  if (!value) return null;
  return {
    ...value,
    startedAt: toIsoString(value.startedAt),
    finishedAt: toIsoString(value.finishedAt),
  };
}

function serializeLog(log: Record<string, unknown>) {
  return {
    ...log,
    createdAt: toIsoString(log.createdAt) ?? '',
  };
}

async function workerFetch(path: string, init?: RequestInit) {
  const env = serverEnv();
  const res = await fetch(`${env.WORKER_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  return (await res.json()) as WorkerJson;
}

async function ensureStore(storeId: string, orgId: string) {
  const rows = await db()
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.orgId, orgId)))
    .limit(1);
  const store = rows[0];
  if (!store) throw new Error('Store not found');
  return store;
}

const terminalStatuses = new Set(['success', 'partial', 'failed', 'cancelled']);

export const startSiteDiscovery = defineAction(
  schemas.discoveryStartSchema,
  async (input, ctx) => {
    const store = await ensureStore(input.storeId, ctx.orgId);
    const runId = randomUUID();
    await db().insert(schema.siteDiscoveryRuns).values({
      id: runId,
      orgId: ctx.orgId,
      competitorId: store.id,
      status: 'queued',
      startUrl: input.startUrl,
      maxPages: input.maxPages,
      maxProducts: input.maxProducts,
      crawlDepth: input.crawlDepth,
      mode: input.mode,
      useAi: input.useAi,
      useManualCaptcha: input.useManualCaptcha,
      respectRobotsTxt: input.respectRobotsTxt,
      includePatterns: input.includePatterns,
      excludePatterns: input.excludePatterns,
      startedAt: new Date(),
      createdBy: ctx.user.id,
    });

    const discoveryPreset =
      typeof input.discoveryPreset === 'string' && input.discoveryPreset.length <= 50
        ? input.discoveryPreset
        : null;
    await db()
      .update(schema.stores)
      .set({
        discoveryPreset,
        discoveryDefaultsJson: {
          maxPages: input.maxPages,
          maxProducts: input.maxProducts,
          crawlDepth: input.crawlDepth,
          maxPagesPerCategory: input.maxPagesPerCategory,
          maxScrollIterations: input.maxScrollIterations,
          mode: input.mode,
          respectRobotsTxt: input.respectRobotsTxt,
          useAi: input.useAi,
          useManualCaptcha: input.useManualCaptcha,
          includePatterns: input.includePatterns,
          excludePatterns: input.excludePatterns,
          domainAllowlist: input.domainAllowlist,
        },
      })
      .where(eq(schema.stores.id, store.id));

    const json = await workerFetch('/discovery/start', {
      method: 'POST',
      body: JSON.stringify({
        runId,
        organizationId: ctx.orgId,
        competitorId: store.id,
        startUrl: input.startUrl,
        maxPages: input.maxPages,
        maxProducts: input.maxProducts,
        crawlDepth: input.crawlDepth,
        maxPagesPerCategory: input.maxPagesPerCategory,
        maxScrollIterations: input.maxScrollIterations,
        concurrency: input.concurrency,
        mode: input.mode,
        respectRobotsTxt: input.respectRobotsTxt,
        useAi: input.useAi,
        useManualCaptcha: input.useManualCaptcha,
        includePatterns: input.includePatterns,
        excludePatterns: input.excludePatterns,
        domainAllowlist: input.domainAllowlist,
        userAgent: USER_AGENT,
      }),
    });

    if (!json.ok) {
      await db()
        .update(schema.siteDiscoveryRuns)
        .set({ status: 'failed', finishedAt: new Date(), errorsCount: 1 })
        .where(eq(schema.siteDiscoveryRuns.id, runId));
      throw new Error(String(json.message ?? 'Failed to start discovery'));
    }
    revalidatePath(`/competitors/${store.id}/discovery`);
    return { runId };
  },
  { roles: ['owner', 'manager'] },
);

async function updateRunStatusFromWorker(runId: string, status: WorkerJson) {
  const finishedAt = toIsoString(status.finishedAt);
  await db()
    .update(schema.siteDiscoveryRuns)
    .set({
      status: String(status.status ?? 'running'),
      pagesDiscovered: Number(status.pagesDiscovered ?? 0),
      pagesCrawled: Number(status.pagesCrawled ?? 0),
      categoriesFound: Number(status.categoriesFound ?? 0),
      productsFound: Number(status.productsFound ?? 0),
      errorsCount: Number(status.errorsCount ?? 0),
      ...(finishedAt ? { finishedAt: new Date(finishedAt) } : {}),
    })
    .where(eq(schema.siteDiscoveryRuns.id, runId));
}

async function persistWorkerReport(runId: string, storeId: string) {
  const reportJson = await workerFetch(`/discovery/${runId}/report`);
  if (!reportJson.ok || !reportJson.report) return;
  const report = reportJson.report as {
    pages?: Array<Record<string, unknown>>;
    categories?: Array<Record<string, unknown>>;
    products?: Array<Record<string, unknown>>;
    logs?: Array<Record<string, unknown>>;
  };

  const pageRows = (report.pages ?? []).map((page) => ({
    runId,
    url: String(page.url),
    normalizedUrl: String(page.normalizedUrl ?? page.url),
    canonicalUrl: page.canonicalUrl ? String(page.canonicalUrl) : null,
    pageType: String(page.pageType ?? 'unknown'),
    status: String(page.status ?? 'crawled'),
    httpStatus: page.httpStatus == null ? null : Number(page.httpStatus),
    depth: Number(page.depth ?? 0),
    parentUrl: page.parentUrl ? String(page.parentUrl) : null,
    title: page.title ? String(page.title) : null,
    h1: page.h1 ? String(page.h1) : null,
    confidence: page.confidence == null ? null : String(page.confidence),
    discoveredFrom: page.discoveredFrom ? String(page.discoveredFrom) : null,
    crawledAt: page.crawledAt ? new Date(String(page.crawledAt)) : null,
    error: page.error ? String(page.error) : null,
  }));
  if (pageRows.length) {
    await db()
      .insert(schema.siteDiscoveryPages)
      .values(pageRows)
      .onConflictDoNothing();
  }

  const categoryIdByUrl = new Map<string, string>();
  const categoryRows = (report.categories ?? []).map((category) => ({
    runId,
    competitorId: storeId,
    url: String(category.url),
    name: String(category.name ?? category.url),
    path: category.path ? String(category.path) : null,
    breadcrumbs: (category.breadcrumbs ?? []) as string[],
    productCountEstimate: category.productCountEstimate == null ? null : Number(category.productCountEstimate),
    productsFound: Number(category.productsFound ?? 0),
    paginationPagesFound: Number(category.paginationPagesFound ?? 0),
    confidence: category.confidence == null ? null : String(category.confidence),
    source: String(category.source ?? 'heuristic'),
  }));
  if (categoryRows.length) {
    const rows = await db()
      .insert(schema.siteDiscoveryCategories)
      .values(categoryRows)
      .onConflictDoNothing()
      .returning({ id: schema.siteDiscoveryCategories.id, url: schema.siteDiscoveryCategories.url });
    for (const row of rows) categoryIdByUrl.set(row.url, row.id);
    const existing = await db()
      .select({ id: schema.siteDiscoveryCategories.id, url: schema.siteDiscoveryCategories.url })
      .from(schema.siteDiscoveryCategories)
      .where(eq(schema.siteDiscoveryCategories.runId, runId));
    for (const row of existing) categoryIdByUrl.set(row.url, row.id);
  }

  const productRows = (report.products ?? []).map((product) => ({
    runId,
    competitorId: storeId,
    categoryId: product.categoryUrl ? categoryIdByUrl.get(String(product.categoryUrl)) ?? null : null,
    url: String(product.url),
    normalizedUrl: String(product.normalizedUrl ?? product.url),
    title: product.title ? String(product.title) : null,
    price: product.price == null ? null : Number(product.price).toFixed(2),
    oldPrice: product.oldPrice == null ? null : Number(product.oldPrice).toFixed(2),
    currency: product.currency ? String(product.currency) : null,
    availability: product.availability ? String(product.availability) : null,
    imageUrl: product.imageUrl ? String(product.imageUrl) : null,
    brand: product.brand ? String(product.brand) : null,
    sku: product.sku ? String(product.sku) : null,
    ean: product.ean ? String(product.ean) : null,
    gtin: product.gtin ? String(product.gtin) : null,
    rating: product.rating == null ? null : String(product.rating),
    shipping: product.shipping ? String(product.shipping) : null,
    categoryPath: product.categoryPath ? String(product.categoryPath) : null,
    breadcrumbs: (product.breadcrumbs ?? []) as string[],
    rawCardJson: product.rawCardJson ?? null,
    rawDetailJson: product.rawDetailJson ?? null,
    confidence: product.confidence == null ? null : String(product.confidence),
    source: String(product.source ?? 'heuristic'),
  }));
  if (productRows.length) {
    await db()
      .insert(schema.siteDiscoveryProducts)
      .values(productRows)
      .onConflictDoNothing();
  }

  await db().delete(schema.siteDiscoveryLogs).where(eq(schema.siteDiscoveryLogs.runId, runId));
  const logRows = (report.logs ?? []).map((log) => ({
    runId,
    level: String(log.level ?? 'info'),
    message: String(log.message ?? ''),
    contextJson: log.context ?? null,
    createdAt: log.createdAt ? new Date(String(log.createdAt)) : new Date(),
  }));
  if (logRows.length) await db().insert(schema.siteDiscoveryLogs).values(logRows.slice(-500));
}

export const getSiteDiscoveryStatus = defineAction(
  schemas.discoveryRunControlSchema,
  async (input, ctx) => {
    await ensureStore(input.storeId, ctx.orgId);
    const json = await workerFetch(`/discovery/${input.runId}/status`);
    if (json.ok && json.status) {
      const status = json.status as WorkerJson;
      await updateRunStatusFromWorker(input.runId, status);
      if (terminalStatuses.has(String(status.status))) {
        await persistWorkerReport(input.runId, input.storeId);
      }
      return serializeRunStatus(status);
    }
    const row = await db()
      .select()
      .from(schema.siteDiscoveryRuns)
      .where(and(eq(schema.siteDiscoveryRuns.id, input.runId), eq(schema.siteDiscoveryRuns.competitorId, input.storeId)))
      .limit(1);
    return serializeRunStatus((row[0] ?? null) as WorkerJson | null);
  },
  { roles: ['owner', 'manager', 'viewer'] },
);

function discoveryControl(path: string) {
  return defineAction(
    schemas.discoveryRunControlSchema,
    async (input, ctx) => {
      await ensureStore(input.storeId, ctx.orgId);
      const json = await workerFetch(`/discovery/${path}`, {
        method: 'POST',
        body: JSON.stringify({ runId: input.runId }),
      });
      if (json.ok && json.status) await updateRunStatusFromWorker(input.runId, json.status as WorkerJson);
      return serializeRunStatus((json.status ?? null) as WorkerJson | null);
    },
    { roles: ['owner', 'manager'] },
  );
}

export const pauseSiteDiscovery = discoveryControl('pause');
export const resumeSiteDiscovery = discoveryControl('resume');
export const cancelSiteDiscovery = discoveryControl('cancel');

export const getSiteDiscoveryLogs = defineAction(
  schemas.discoveryRunControlSchema,
  async (input, ctx) => {
    await ensureStore(input.storeId, ctx.orgId);
    const json = await workerFetch(`/discovery/${input.runId}/logs`);
    return ((json.logs ?? []) as Array<Record<string, unknown>>).map(serializeLog);
  },
  { roles: ['owner', 'manager', 'viewer'] },
);

export async function loadDiscoveryRuns(storeId: string) {
  const ctx = await getContext();
  await ensureStore(storeId, ctx.orgId);
  return db()
    .select()
    .from(schema.siteDiscoveryRuns)
    .where(eq(schema.siteDiscoveryRuns.competitorId, storeId))
    .orderBy(sql`${schema.siteDiscoveryRuns.startedAt} desc nulls last`)
    .limit(20);
}

export async function loadDiscoveryReport(storeId: string, runId: string) {
  const ctx = await getContext();
  await ensureStore(storeId, ctx.orgId);
  await persistWorkerReport(runId, storeId).catch(() => null);
  const [run] = await db()
    .select()
    .from(schema.siteDiscoveryRuns)
    .where(and(eq(schema.siteDiscoveryRuns.id, runId), eq(schema.siteDiscoveryRuns.competitorId, storeId)))
    .limit(1);
  const [pages, categories, products, logs] = await Promise.all([
    db().select().from(schema.siteDiscoveryPages).where(eq(schema.siteDiscoveryPages.runId, runId)),
    db().select().from(schema.siteDiscoveryCategories).where(eq(schema.siteDiscoveryCategories.runId, runId)),
    db().select().from(schema.siteDiscoveryProducts).where(eq(schema.siteDiscoveryProducts.runId, runId)),
    db().select().from(schema.siteDiscoveryLogs).where(eq(schema.siteDiscoveryLogs.runId, runId)).limit(500),
  ]);
  return { run, pages, categories, products, logs };
}

export const saveDiscoveredProducts = defineAction(
  schemas.discoverySaveProductsSchema,
  async (input, ctx) => {
    await ensureStore(input.storeId, ctx.orgId);
    const conditions = [eq(schema.siteDiscoveryProducts.runId, input.runId)];
    if (!input.saveAllValid && input.productIds?.length) {
      conditions.push(inArray(schema.siteDiscoveryProducts.id, input.productIds));
    }
    const rows = await db()
      .select()
      .from(schema.siteDiscoveryProducts)
      .where(and(...conditions));

    let imported = 0;
    let skipped = 0;
    for (const product of rows) {
      if (!product.title || !product.price || !product.url) {
        skipped++;
        continue;
      }
      await db()
        .insert(schema.competitorProducts)
        .values({
          orgId: ctx.orgId,
          storeId: input.storeId,
          url: product.url,
          urlHash: urlHash(product.normalizedUrl),
          title: product.title,
          brand: product.brand,
          sku: product.sku,
          gtin: product.gtin ?? product.ean,
          imageUrl: product.imageUrl,
          lastSnapshotPrice: product.price,
          lastSnapshotCurrency: product.currency,
          lastSnapshotAvailability: product.availability,
          createdBy: ctx.user.id,
          nextRunAt: new Date(),
        })
        .onConflictDoNothing();
      imported++;
    }
    revalidatePath(`/competitors/${input.storeId}`);
    revalidatePath('/products');
    return { imported, skipped };
  },
  { roles: ['owner', 'manager'] },
);
