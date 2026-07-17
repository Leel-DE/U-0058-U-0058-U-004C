/**
 * Service-level scraping pipeline. Called from Inngest functions and from
 * the on-demand "trigger now" server action. Encapsulates fetch → parse →
 * dedup → insert → alert-fan-out so all entry points behave identically.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { errorToLog, logStructured, USER_AGENT, type ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { evaluateAlertsForSnapshot } from '@/server/alerts/evaluate';
import { DEFAULT_SCRAPE_RETRY_POLICY, withRetryBudget, type RetryAttempt } from '@/server/reliability/retry';
import {
  createSelectorRepairAttempt,
  recordSelectorRepairRetryResult,
} from '@/server/selectors/create-selector-repair-attempt';

interface RunInput {
  orgId: string;
  competitorProductId: string;
  runId?: string;
  strategy?: 'cheerio' | 'playwright' | 'auto';
  skipSelectorRepair?: boolean;
}

interface RunOutput {
  ok: boolean;
  errorCode?: string;
  snapshotInserted: boolean;
}

function recommendedStrategy(successRate: number, captchaRate: number) {
  if (captchaRate > 0.2) return 'manual_captcha';
  if (successRate < 0.7) return 'playwright_primary';
  return 'auto';
}

async function recordExtractionArtifact(args: {
  input: RunInput;
  storeId: string;
  url: string;
  rules: Record<string, unknown>;
  response: ScrapeResponse;
  retryAttempts: RetryAttempt[];
}): Promise<string> {
  const storage = createSupabaseServiceRoleClient();
  const artifactId = randomUUID();
  const htmlSnapshot = args.response.raw?.htmlSnippet ?? null;
  const htmlStorageKey = htmlSnapshot
    ? `${args.input.orgId}/${args.input.competitorProductId}/${artifactId}.html`
    : null;
  const screenshotStorageKey = args.response.raw?.screenshotBase64
    ? `${args.input.orgId}/${args.input.competitorProductId}/${artifactId}.jpg`
    : null;

  if (htmlSnapshot && htmlStorageKey) {
    await storage.storage
      .from('html')
      .upload(htmlStorageKey, Buffer.from(htmlSnapshot, 'utf8'), { contentType: 'text/html', upsert: true })
      .catch(() => null);
  }
  if (args.response.raw?.screenshotBase64 && screenshotStorageKey) {
    await storage.storage
      .from('screenshots')
      .upload(screenshotStorageKey, Buffer.from(args.response.raw.screenshotBase64, 'base64'), {
        contentType: 'image/jpeg',
        upsert: true,
      })
      .catch(() => null);
  }

  await db().insert(schema.extractionDebugArtifacts).values({
    id: artifactId,
    orgId: args.input.orgId,
    storeId: args.storeId,
    competitorProductId: args.input.competitorProductId,
    scrapeRunId: args.input.runId,
    url: args.url,
    status: args.response.ok ? 'ok' : args.response.errorCode,
    errorType: args.response.ok ? null : args.response.errorCode,
    errorMessage: args.response.ok ? null : args.response.message.slice(0, 500),
    htmlStorageKey,
    htmlSnapshot,
    screenshotStorageKey,
    selectorSetJson: args.rules,
    extractedJson: args.response.ok ? args.response.data : null,
    confidenceJson: args.response.ok
      ? {
          overall: args.response.meta.confidence,
          sourcePath: args.response.meta.sourcePath,
          fields: args.response.meta.fieldConfidence ?? null,
        }
      : null,
    logsJson: args.retryAttempts.map((attempt) => ({
      level: 'warn',
      event: 'retry_scheduled',
      ...attempt,
    })),
    replayable: Boolean(args.response.raw?.htmlSnippet),
  });
  return artifactId;
}

async function updateCrawlDomainHealth(args: {
  orgId: string;
  domain: string;
  retryCount: number;
}) {
  const [stats] = await db().execute<{
    total: number;
    ok_count: number;
    captcha_count: number;
    failure_count: number;
    avg_response_ms: number | null;
    last_success_at: string | null;
    last_failure_at: string | null;
  }>(sql`
    select
      count(ps.id)::int as total,
      count(ps.id) filter (where ps.status = 'ok')::int as ok_count,
      count(ps.id) filter (where ps.status = 'captcha')::int as captcha_count,
      count(ps.id) filter (where ps.status <> 'ok')::int as failure_count,
      avg(ps.duration_ms)::int as avg_response_ms,
      max(ps.scraped_at) filter (where ps.status = 'ok')::text as last_success_at,
      max(ps.scraped_at) filter (where ps.status <> 'ok')::text as last_failure_at
    from price_snapshots ps
    join competitor_products cp on cp.id = ps.competitor_product_id
    join stores st on st.id = cp.store_id
    where ps.org_id = ${args.orgId}
      and st.domain = ${args.domain}
      and ps.scraped_at >= now() - interval '7 days'
  `);
  const total = stats?.total ?? 0;
  const successRate = total > 0 ? (stats?.ok_count ?? 0) / total : 0;
  const captchaRate = total > 0 ? (stats?.captcha_count ?? 0) / total : 0;
  await db().execute(sql`
    insert into crawl_domain_health (
      organization_id,
      domain,
      success_rate,
      avg_response_ms,
      captcha_rate,
      retry_count,
      failure_count,
      recommended_strategy,
      last_success_at,
      last_failure_at,
      updated_at
    )
    values (
      ${args.orgId},
      ${args.domain},
      ${successRate.toFixed(4)},
      ${stats?.avg_response_ms ?? null},
      ${captchaRate.toFixed(4)},
      ${args.retryCount},
      ${stats?.failure_count ?? 0},
      ${recommendedStrategy(successRate, captchaRate)},
      ${stats?.last_success_at ? new Date(stats.last_success_at) : null},
      ${stats?.last_failure_at ? new Date(stats.last_failure_at) : null},
      now()
    )
    on conflict (organization_id, domain) do update set
      success_rate = excluded.success_rate,
      avg_response_ms = excluded.avg_response_ms,
      captcha_rate = excluded.captcha_rate,
      retry_count = crawl_domain_health.retry_count + excluded.retry_count,
      failure_count = excluded.failure_count,
      recommended_strategy = excluded.recommended_strategy,
      last_success_at = excluded.last_success_at,
      last_failure_at = excluded.last_failure_at,
      updated_at = now()
  `);
}

export async function runScrapeForProduct(input: RunInput): Promise<RunOutput> {
  const env = serverEnv();
  const rows = await db()
    .select({
      product: schema.competitorProducts,
      store: schema.stores,
      rules: schema.scrapingRules,
      automationSettings: schema.automationSettings,
    })
    .from(schema.competitorProducts)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .leftJoin(
      schema.automationSettings,
      eq(schema.automationSettings.orgId, schema.competitorProducts.orgId),
    )
    .where(
      and(
        eq(schema.competitorProducts.id, input.competitorProductId),
        eq(schema.competitorProducts.orgId, input.orgId),
      ),
    )
    .limit(1);

  const ctx = rows[0];
  if (!ctx) return { ok: false, errorCode: 'not_found', snapshotInserted: false };
  const { product, store, rules, automationSettings } = ctx;

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
      brandSelector: rules?.brandSelector ?? null,
      skuSelector: rules?.skuSelector ?? null,
      breadcrumbsSelector: rules?.breadcrumbsSelector ?? null,
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
  const retryAttempts: RetryAttempt[] = [];
  try {
    response = await withRetryBudget(
      async () => {
        const res = await fetch(`${env.WORKER_URL}/scrape`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok && res.status >= 500) {
          throw new Error(`worker_http_${res.status}`);
        }
        return (await res.json()) as ScrapeResponse;
      },
      DEFAULT_SCRAPE_RETRY_POLICY,
      (attempt) => {
        retryAttempts.push(attempt);
        logStructured({
          service: 'web',
          level: 'warn',
          category: 'scraping',
          scrapeJobId: input.runId,
          competitorId: store.id,
          productId: product.id,
          event: 'scrape_retry_scheduled',
          metadata: { ...attempt },
        });
      },
    );
  } catch (err) {
    logStructured({
      service: 'web',
      level: 'error',
      category: 'scraping',
      scrapeJobId: input.runId,
      competitorId: store.id,
      productId: product.id,
      event: 'scrape_worker_request_failed',
      error: errorToLog(err),
    });
    response = {
      ok: false,
      errorCode: 'http_error',
      message: (err as Error).message,
      meta: { strategy: 'cheerio', durationMs: 0 },
    };
  }

  if (!response.ok) {
    const selectorFailureCount =
      response.errorCode === 'parse_failed'
        ? (product.selectorFailureCount ?? 0) + 1
        : product.selectorFailureCount;
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
        selectorFailureCount,
      })
      .where(eq(schema.competitorProducts.id, product.id));
    const debugArtifactId = await recordExtractionArtifact({
      input,
      storeId: store.id,
      url: product.url,
      rules: body.rules,
      response,
      retryAttempts,
    }).catch((err) => {
      console.error('[extraction_debug_artifacts] insert failed', err);
      return null;
    });
    await updateCrawlDomainHealth({
      orgId: input.orgId,
      domain: store.domain,
      retryCount: retryAttempts.length,
    }).catch((err) => console.error('[crawl_domain_health] update failed', err));
    logStructured({
      service: 'web',
      level: 'warn',
      category: 'scraping',
      scrapeJobId: input.runId,
      competitorId: store.id,
      productId: product.id,
      event: 'scrape_failed',
      durationMs: response.meta.durationMs,
      metadata: { errorCode: response.errorCode, retryCount: retryAttempts.length },
    });

    if (response.errorCode === 'parse_failed' && !input.skipSelectorRepair) {
      if (!debugArtifactId) {
        logStructured({
          service: 'web',
          level: 'warn',
          category: 'selector_repair',
          scrapeJobId: input.runId,
          competitorId: store.id,
          productId: product.id,
          event: 'selector_repair_skipped',
          metadata: { reason: 'html_artifact_missing' },
        });
      } else {
        logStructured({
          service: 'web',
          level: 'info',
          category: 'selector_repair',
          scrapeJobId: input.runId,
          competitorId: store.id,
          productId: product.id,
          event: 'selector_repair_started',
          metadata: { debugArtifactId, selectorFailureCount },
        });
        const repair = await createSelectorRepairAttempt({
          orgId: input.orgId,
          competitorProductId: product.id,
          storeId: store.id,
          scrapeRunId: input.runId ?? null,
          debugArtifactId,
          triggerReason: 'parse_failed',
          status: response.errorCode,
          selectorFailureCount,
          confidence: 0,
        }).catch((err) => {
          logStructured({
            service: 'web',
            level: 'error',
            category: 'selector_repair',
            scrapeJobId: input.runId,
            competitorId: store.id,
            productId: product.id,
            event: 'selector_repair_validation_failed',
            error: errorToLog(err),
          });
          return null;
        });

        if (repair?.applied && repair.attemptId) {
          logStructured({
            service: 'web',
            level: 'info',
            category: 'selector_repair',
            scrapeJobId: input.runId,
            competitorId: store.id,
            productId: product.id,
            event: 'selector_repair_applied',
            metadata: { attemptId: repair.attemptId },
          });
          const retry = await runScrapeForProduct({
            ...input,
            skipSelectorRepair: true,
          });
          await recordSelectorRepairRetryResult({ attemptId: repair.attemptId, result: retry }).catch((err) =>
            console.error('[selector_repair_attempts] retry result update failed', err),
          );
          logStructured({
            service: 'web',
            level: retry.ok ? 'info' : 'warn',
            category: 'selector_repair',
            scrapeJobId: input.runId,
            competitorId: store.id,
            productId: product.id,
            event: retry.ok ? 'selector_repair_retry_success' : 'selector_repair_retry_failed',
            metadata: { attemptId: repair.attemptId, result: retry },
          });
          return retry;
        }

        if (repair) {
          logStructured({
            service: 'web',
            level: repair.status === 'skipped' ? 'warn' : repair.status === 'failed' ? 'error' : 'info',
            category: 'selector_repair',
            scrapeJobId: input.runId,
            competitorId: store.id,
            productId: product.id,
            event: repair.status === 'skipped' ? 'selector_repair_skipped' : 'selector_repair_ai_suggested',
            metadata: repair,
          });
        }
      }
    }
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
  const competitorIntervalMinutes =
    automationSettings?.competitorIntervalMinutes ?? store.crawlFrequencyMinutes;

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
      nextRunAt: new Date(fetchedAt.getTime() + competitorIntervalMinutes * 60_000),
    })
    .where(eq(schema.competitorProducts.id, product.id));

  // refresh store health
  await db()
    .update(schema.stores)
    .set({ lastSuccessfulScrapeAt: fetchedAt, status: 'active' })
    .where(eq(schema.stores.id, store.id));

  await recordExtractionArtifact({
    input,
    storeId: store.id,
    url: product.url,
    rules: body.rules,
    response,
    retryAttempts,
  }).catch((err) => console.error('[extraction_debug_artifacts] insert failed', err));
  await updateCrawlDomainHealth({
    orgId: input.orgId,
    domain: store.domain,
    retryCount: retryAttempts.length,
  }).catch((err) => console.error('[crawl_domain_health] update failed', err));
  logStructured({
    service: 'web',
    level: 'info',
    category: 'scraping',
    scrapeJobId: input.runId,
    competitorId: store.id,
    productId: product.id,
    event: 'scrape_completed',
    durationMs: response.meta.durationMs,
    metadata: {
      snapshotInserted,
      confidence: response.meta.confidence,
      sourcePath: response.meta.sourcePath,
      retryCount: retryAttempts.length,
    },
  });

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
