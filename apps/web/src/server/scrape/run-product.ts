/**
 * Service-level scraping pipeline. Called from Inngest functions and from
 * the on-demand "trigger now" server action. Encapsulates fetch → parse →
 * dedup → insert → alert-fan-out so all entry points behave identically.
 */
import { and, eq, desc } from 'drizzle-orm';
import { USER_AGENT, type ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { evaluateAlertsForSnapshot } from '@/server/alerts/evaluate';

interface RunInput {
  orgId: string;
  competitorProductId: string;
  runId?: string;
  strategy?: 'cheerio' | 'playwright' | 'auto';
}

interface RunOutput {
  ok: boolean;
  errorCode?: string;
  snapshotInserted: boolean;
}

export async function runScrapeForProduct(input: RunInput): Promise<RunOutput> {
  const env = serverEnv();
  const rows = await db()
    .select({
      product: schema.competitorProducts,
      store: schema.stores,
      rules: schema.scrapingRules,
    })
    .from(schema.competitorProducts)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.competitorProducts.id, input.competitorProductId),
        eq(schema.competitorProducts.orgId, input.orgId),
      ),
    )
    .limit(1);

  const ctx = rows[0];
  if (!ctx) return { ok: false, errorCode: 'not_found', snapshotInserted: false };
  const { product, store, rules } = ctx;

  const strategy =
    input.strategy ?? (store.jsRequired ? 'playwright' : 'auto');

  const body = {
    url: product.url,
    strategy,
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
    userAgent: rules?.customUserAgent ?? USER_AGENT,
    timeoutMs: strategy === 'playwright' ? 30_000 : 15_000,
  };

  const fetchedAt = new Date();
  let response: ScrapeResponse;
  try {
    const res = await fetch(`${env.WORKER_URL}/scrape`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    response = (await res.json()) as ScrapeResponse;
  } catch (err) {
    response = {
      ok: false,
      errorCode: 'http_error',
      message: (err as Error).message,
      meta: { strategy: 'cheerio', durationMs: 0 },
    };
  }

  if (!response.ok) {
    await db().insert(schema.priceSnapshots).values({
      orgId: input.orgId,
      competitorProductId: product.id,
      scrapedAt: fetchedAt,
      status: response.errorCode,
      source: strategy === 'playwright' ? 'playwright' : 'cheerio',
      sourcePath: 'fetch_failed',
      httpStatus: response.meta.httpStatus,
      durationMs: response.meta.durationMs,
      errorMessage: response.message.slice(0, 500),
      confidence: '0.00',
      scrapeRunId: input.runId,
    });
    await db()
      .update(schema.competitorProducts)
      .set({
        lastScrapedAt: fetchedAt,
        selectorFailureCount:
          response.errorCode === 'parse_failed'
            ? (product.selectorFailureCount ?? 0) + 1
            : product.selectorFailureCount,
      })
      .where(eq(schema.competitorProducts.id, product.id));
    return { ok: false, errorCode: response.errorCode, snapshotInserted: false };
  }

  const data = response.data;
  const newPrice = data.price != null ? Number(data.price.toFixed(2)) : null;
  const prevPrice = product.lastSnapshotPrice != null ? Number(product.lastSnapshotPrice) : null;
  const newAvailability = data.availability ?? 'unknown';
  const changed =
    prevPrice == null ||
    (newPrice != null && Math.abs(prevPrice - newPrice) > 0.0001) ||
    product.lastSnapshotAvailability !== newAvailability ||
    product.lastSnapshotCurrency !== (data.currency ?? null);

  let snapshotInserted = false;
  if (changed) {
    await db().insert(schema.priceSnapshots).values({
      orgId: input.orgId,
      competitorProductId: product.id,
      scrapedAt: fetchedAt,
      price: newPrice != null ? newPrice.toFixed(2) : null,
      oldPrice: data.oldPrice != null ? Number(data.oldPrice).toFixed(2) : null,
      currency: data.currency,
      availability: data.availability,
      title: data.title,
      imageUrl: data.image,
      shippingText: data.shipping,
      rating: data.rating != null ? data.rating.toFixed(2) : null,
      status: 'ok',
      confidence: response.meta.confidence.toFixed(2),
      source: response.meta.strategy,
      sourcePath: response.meta.sourcePath,
      httpStatus: response.meta.httpStatus,
      durationMs: response.meta.durationMs,
      scrapeRunId: input.runId,
    });
    snapshotInserted = true;
  }

  // refresh product summary fields + reset failure counter
  await db()
    .update(schema.competitorProducts)
    .set({
      lastScrapedAt: fetchedAt,
      lastChangeAt: changed ? fetchedAt : product.lastChangeAt,
      lastSnapshotPrice: newPrice != null ? newPrice.toFixed(2) : product.lastSnapshotPrice,
      lastSnapshotCurrency: data.currency ?? product.lastSnapshotCurrency,
      lastSnapshotAvailability: newAvailability,
      title: data.title ?? product.title,
      imageUrl: data.image ?? product.imageUrl,
      selectorFailureCount: 0,
      nextRunAt: new Date(fetchedAt.getTime() + store.crawlFrequencyMinutes * 60_000),
    })
    .where(eq(schema.competitorProducts.id, product.id));

  // refresh store health
  await db()
    .update(schema.stores)
    .set({ lastSuccessfulScrapeAt: fetchedAt, status: 'active' })
    .where(eq(schema.stores.id, store.id));

  if (snapshotInserted) {
    try {
      await evaluateAlertsForSnapshot({
        orgId: input.orgId,
        competitorProductId: product.id,
        newPrice,
        newAvailability,
        prevPrice,
        prevAvailability: product.lastSnapshotAvailability,
        currency: data.currency ?? null,
      });
    } catch (err) {
      console.error('[evaluateAlertsForSnapshot] failed', err);
    }
  }

  return { ok: true, snapshotInserted };
}

/** Convenience helper for listing the latest N snapshots — kept here so route handlers and
 *  Inngest functions don't reach into the DB schema directly. */
export async function latestSnapshots(competitorProductId: string, limit = 100) {
  return db()
    .select()
    .from(schema.priceSnapshots)
    .where(eq(schema.priceSnapshots.competitorProductId, competitorProductId))
    .orderBy(desc(schema.priceSnapshots.scrapedAt))
    .limit(limit);
}
