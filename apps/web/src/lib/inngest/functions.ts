import { and, eq, lte } from 'drizzle-orm';
import { inngest } from './client';
import { db, schema } from '@/lib/db';
import { evaluateNoChangeAlerts } from '@/server/alerts/evaluate';
import { randomUUID } from 'node:crypto';

/**
 * Cron: every 5 minutes, look up products whose next_run_at is in the past
 * (per active store) and emit per-store scrape events. Inngest's
 * concurrency-by-key throttles per domain.
 */
export const scheduleScraping = inngest.createFunction(
  { id: 'schedule-scraping', name: 'Schedule scraping (cron)' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const dueStores = await step.run('find-due-stores', async () => {
      const rows = await db()
        .selectDistinct({
          orgId: schema.competitorProducts.orgId,
          storeId: schema.competitorProducts.storeId,
        })
        .from(schema.competitorProducts)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
        .where(
          and(
            eq(schema.competitorProducts.active, true),
            eq(schema.stores.status, 'active'),
            lte(schema.competitorProducts.nextRunAt, new Date()),
          ),
        );
      return rows;
    });

    if (dueStores.length === 0) return { stores: 0 };

    await step.sendEvent(
      'enqueue-store-scrapes',
      dueStores.map(({ orgId, storeId }) => ({
        name: 'store.scrape.requested',
        data: { orgId, storeId, runId: randomUUID() },
      })),
    );

    return { stores: dueStores.length };
  },
);

/**
 * Per-store fan-out. Concurrency key = domain so we never hit the same domain
 * with two simultaneous jobs even across orgs.
 */
export const scrapeStore = inngest.createFunction(
  {
    id: 'scrape-store',
    name: 'Scrape store (fan-out)',
    concurrency: [{ key: 'event.data.storeId', limit: 1 }],
  },
  { event: 'store.scrape.requested' },
  async ({ event, step }) => {
    const { orgId, storeId, runId } = event.data;

    const store = await step.run('load-store', async () => {
      const rows = await db()
        .select()
        .from(schema.stores)
        .where(and(eq(schema.stores.id, storeId), eq(schema.stores.orgId, orgId)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!store) return { skipped: 'store_missing' };

    const products = await step.run('list-due-products', async () => {
      return db()
        .select({ id: schema.competitorProducts.id })
        .from(schema.competitorProducts)
        .where(
          and(
            eq(schema.competitorProducts.storeId, storeId),
            eq(schema.competitorProducts.active, true),
            lte(schema.competitorProducts.nextRunAt, new Date()),
          ),
        )
        .limit(200);
    });

    if (products.length === 0) return { products: 0 };

    await step.run('create-run-row', async () => {
      await db().insert(schema.scrapeRuns).values({
        id: runId,
        orgId,
        storeId,
        status: 'queued',
        productsTotal: products.length,
      });
    });

    await step.sendEvent(
      'enqueue-products',
      products.map((p) => ({
        name: 'product.scrape.requested',
        data: { orgId, storeId, competitorProductId: p.id, runId },
      })),
    );

    return { products: products.length, runId };
  },
);

/**
 * One product = one job. Per-domain throttle + retries on transient errors.
 */
export const scrapeProduct = inngest.createFunction(
  {
    id: 'scrape-product',
    name: 'Scrape single product',
    concurrency: [{ key: 'event.data.storeId', limit: 1 }],
    retries: 3,
    throttle: { key: 'event.data.storeId', limit: 1, period: '3s' },
  },
  { event: 'product.scrape.requested' },
  async ({ event, step }) => {
    const { orgId, competitorProductId, runId } = event.data;
    const result = await step.run('queue-browser-job', async () => {
      const [job] = await db()
        .insert(schema.automationJobs)
        .values({
          orgId,
          type: 'competitor_scrape',
          priority: 'normal',
          payloadJson: { inputVersion: 1, competitorProductId, scrapeRunId: runId },
          dedupeKey: `competitor:${competitorProductId}`,
        })
        .onConflictDoNothing()
        .returning({ id: schema.automationJobs.id });
      return { queued: Boolean(job), jobId: job?.id ?? null };
    });
    return result;
  },
);

/**
 * Hourly sweep for alerts that don't fire on a new snapshot (e.g. "product
 * disappeared", "stale data > 48h"). These look at the current state, not the
 * event of a new snapshot, so they need their own schedule.
 */
export const evaluateStateAlerts = inngest.createFunction(
  { id: 'evaluate-state-alerts', name: 'Evaluate state-based alerts (hourly)' },
  { cron: '0 * * * *' },
  async () => {
    const orgs = await db()
      .selectDistinct({ id: schema.organizations.id })
      .from(schema.organizations);
    for (const { id: orgId } of orgs) {
      try {
        await evaluateNoChangeAlerts(orgId);
      } catch (err) {
        console.error('[evaluateNoChangeAlerts] org=' + orgId, err);
      }
    }
    return { orgs: orgs.length };
  },
);

export const functions = [scheduleScraping, scrapeStore, scrapeProduct, evaluateStateAlerts];
