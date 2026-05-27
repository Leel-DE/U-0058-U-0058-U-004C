import { and, desc, eq, sql } from 'drizzle-orm';
import type { ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { applySelectorRepair } from './apply-selector-repair';
import { evaluateSelectorRepairEligibility } from './selector-repair-policy';

export const PRODUCT_REPAIR_REQUIRED_FIELDS = ['titleSelector', 'priceSelector'] as const;

type ProductRepairRequiredField = (typeof PRODUCT_REPAIR_REQUIRED_FIELDS)[number];

type RulesLike = {
  titleSelector?: string | null;
  priceSelector?: string | null;
  oldPriceSelector?: string | null;
  availabilitySelector?: string | null;
  imageSelector?: string | null;
  brandSelector?: string | null;
  skuSelector?: string | null;
  breadcrumbsSelector?: string | null;
  priceRegex?: string | null;
  useJsonLd?: boolean;
  useOpenGraph?: boolean;
};

interface WorkerRepairResponse {
  ok: boolean;
  status: 'skipped' | 'suggested' | 'validated' | 'failed';
  suggestedSelectors?: Record<string, string | null>;
  appliedSelectors?: Record<string, string | null>;
  validation?: unknown;
  confidence: number;
  reason?: string;
  warnings: string[];
  error?: string;
  cleanedDomHash?: string;
  tokenEstimate?: number;
  aiProvider?: string;
  aiModel?: string;
  autoApplyRecommended: boolean;
}

function oldSelectorsFromRules(rules: RulesLike | null | undefined) {
  return {
    titleSelector: rules?.titleSelector ?? null,
    priceSelector: rules?.priceSelector ?? null,
    oldPriceSelector: rules?.oldPriceSelector ?? null,
    availabilitySelector: rules?.availabilitySelector ?? null,
    imageSelector: rules?.imageSelector ?? null,
    brandSelector: rules?.brandSelector ?? null,
    skuSelector: rules?.skuSelector ?? null,
    breadcrumbsSelector: rules?.breadcrumbsSelector ?? null,
    priceRegex: rules?.priceRegex ?? null,
    useJsonLd: rules?.useJsonLd ?? true,
    useOpenGraph: rules?.useOpenGraph ?? true,
  };
}

async function workerAiEnabled() {
  const env = serverEnv();
  try {
    const res = await fetch(`${env.WORKER_URL}/ai/status`, {
      headers: { authorization: `Bearer ${env.WORKER_SHARED_SECRET}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
}

async function countSameRunAttempts(args: { productId: string; scrapeRunId?: string | null }) {
  if (!args.scrapeRunId) return 0;
  const [row] = await db().execute<{ count: number }>(sql`
    select count(*)::int as count
    from selector_repair_attempts
    where product_id = ${args.productId}
      and scrape_run_id = ${args.scrapeRunId}
  `);
  return Number(row?.count ?? 0);
}

async function countCompetitorAttemptsLastHour(competitorId: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const [row] = await db().execute<{ count: number }>(sql`
    select count(*)::int as count
    from selector_repair_attempts
    where competitor_id = ${competitorId}
      and created_at >= ${oneHourAgo}
      and status <> 'skipped'
  `);
  return Number(row?.count ?? 0);
}

async function callWorkerRepair(input: {
  html: string;
  url: string;
  oldSelectors: Record<string, unknown>;
  failedFields: ProductRepairRequiredField[];
  previousValues: Record<string, unknown>;
  store: Record<string, unknown>;
}) {
  const env = serverEnv();
  const res = await fetch(`${env.WORKER_URL}/selectors/repair`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`worker_repair_http_${res.status}`);
  return (await res.json()) as WorkerRepairResponse;
}

export async function createSelectorRepairAttempt(args: {
  orgId: string;
  competitorProductId: string;
  storeId: string;
  scrapeRunId?: string | null;
  debugArtifactId: string;
  triggerReason: string;
  status: string;
  selectorFailureCount: number;
  confidence?: number | null;
}) {
  const [context] = await db()
    .select({
      product: schema.competitorProducts,
      store: schema.stores,
      rules: schema.scrapingRules,
      profile: schema.competitorProfiles,
      artifact: schema.extractionDebugArtifacts,
    })
    .from(schema.competitorProducts)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .leftJoin(schema.competitorProfiles, eq(schema.competitorProfiles.storeId, schema.stores.id))
    .leftJoin(schema.extractionDebugArtifacts, eq(schema.extractionDebugArtifacts.id, args.debugArtifactId))
    .where(
      and(
        eq(schema.competitorProducts.id, args.competitorProductId),
        eq(schema.competitorProducts.orgId, args.orgId),
      ),
    )
    .limit(1);
  if (!context) return { attemptId: null, status: 'skipped' as const, applied: false, reason: 'product_missing' };

  const oldSelectors = oldSelectorsFromRules(context.rules);
  const [previous] = await db()
    .select({
      title: schema.priceSnapshots.title,
      price: schema.priceSnapshots.price,
      currency: schema.priceSnapshots.currency,
      availability: schema.priceSnapshots.availability,
      image: schema.priceSnapshots.imageUrl,
    })
    .from(schema.priceSnapshots)
    .where(
      and(
        eq(schema.priceSnapshots.competitorProductId, args.competitorProductId),
        eq(schema.priceSnapshots.status, 'ok'),
      ),
    )
    .orderBy(desc(schema.priceSnapshots.scrapedAt))
    .limit(1);

  const [aiEnabled, sameRunAttemptCount, competitorAttemptsLastHour] = await Promise.all([
    workerAiEnabled(),
    countSameRunAttempts({ productId: args.competitorProductId, scrapeRunId: args.scrapeRunId }),
    countCompetitorAttemptsLastHour(args.storeId),
  ]);
  const eligibility = evaluateSelectorRepairEligibility({
    status: args.status,
    selectorFailureCount: args.selectorFailureCount,
    hasHtmlArtifact: Boolean(context.artifact?.htmlSnapshot),
    aiEnabled,
    confidence: args.confidence,
    sameRunAttemptCount,
    competitorAttemptsLastHour,
  });

  const [attempt] = await db()
    .insert(schema.selectorRepairAttempts)
    .values({
      orgId: args.orgId,
      competitorId: context.store.id,
      productId: context.product.id,
      scrapeRunId: args.scrapeRunId ?? null,
      scrapingRuleId: context.rules?.id ?? null,
      debugArtifactId: context.artifact?.id ?? args.debugArtifactId,
      status: eligibility.eligible ? 'pending' : 'skipped',
      triggerReason: eligibility.reason,
      oldSelectorsJson: oldSelectors,
      error: eligibility.eligible ? null : eligibility.reason,
    })
    .returning();

  if (!attempt || !eligibility.eligible) {
    return {
      attemptId: attempt?.id ?? null,
      status: 'skipped' as const,
      applied: false,
      reason: eligibility.reason,
    };
  }

  try {
    const result = await callWorkerRepair({
      html: context.artifact?.htmlSnapshot ?? '',
      url: context.product.url,
      oldSelectors,
      failedFields: [...PRODUCT_REPAIR_REQUIRED_FIELDS],
      previousValues: {
        title: previous?.title ?? context.product.title ?? null,
        price: previous?.price == null ? null : Number(previous.price),
        currency: previous?.currency ?? context.store.currency,
        availability: previous?.availability ?? context.product.lastSnapshotAvailability ?? null,
        image: previous?.image ?? context.product.imageUrl ?? null,
        sku: context.product.sku ?? null,
      },
      store: {
        name: context.store.name,
        domain: context.store.domain,
        framework: context.profile?.framework ?? null,
      },
    });

    const nextStatus = result.status === 'validated' && result.autoApplyRecommended ? 'validated' : result.status;
    await db()
      .update(schema.selectorRepairAttempts)
      .set({
        status: nextStatus,
        suggestedSelectorsJson: result.suggestedSelectors ?? null,
        validationResultJson: result.validation ?? null,
        aiProvider: result.aiProvider ?? null,
        aiModel: result.aiModel ?? null,
        confidence: result.confidence.toFixed(3),
        error: result.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.selectorRepairAttempts.id, attempt.id));

    if (result.suggestedSelectors) {
      await db()
        .insert(schema.aiExtractionSuggestions)
        .values({
          orgId: args.orgId,
          competitorId: context.store.id,
          url: context.product.url,
          cleanedDomHash: result.cleanedDomHash ?? attempt.id,
          suggestedRulesJson: {
            type: 'selector_repair',
            selectors: result.suggestedSelectors,
            validation: result.validation ?? null,
            reason: result.reason ?? null,
            warnings: result.warnings,
          },
          confidence: result.confidence.toFixed(3),
          status: result.autoApplyRecommended ? 'validated' : result.status,
        })
        .catch(() => null);
    }

    if (result.autoApplyRecommended && result.status === 'validated') {
      await applySelectorRepair({
        orgId: args.orgId,
        attemptId: attempt.id,
        requireAutoThreshold: true,
      });
      return { attemptId: attempt.id, status: 'applied' as const, applied: true, reason: result.reason };
    }

    return {
      attemptId: attempt.id,
      status: nextStatus,
      applied: false,
      reason: result.reason ?? result.error ?? nextStatus,
    };
  } catch (err) {
    await db()
      .update(schema.selectorRepairAttempts)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(schema.selectorRepairAttempts.id, attempt.id));
    return {
      attemptId: attempt.id,
      status: 'failed' as const,
      applied: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function recordSelectorRepairRetryResult(args: {
  attemptId: string;
  result: ScrapeResponse | { ok: boolean; errorCode?: string; snapshotInserted?: boolean };
}) {
  await db()
    .update(schema.selectorRepairAttempts)
    .set({
      retryResultJson: args.result,
      updatedAt: new Date(),
    })
    .where(eq(schema.selectorRepairAttempts.id, args.attemptId));
}

export async function retrySelectorRepairAttempt(orgId: string, attemptId: string) {
  const [attempt] = await db()
    .select()
    .from(schema.selectorRepairAttempts)
    .where(and(eq(schema.selectorRepairAttempts.orgId, orgId), eq(schema.selectorRepairAttempts.id, attemptId)))
    .limit(1);
  if (!attempt) throw new Error('Selector repair attempt not found');
  if (!attempt.productId || !attempt.competitorId || !attempt.debugArtifactId) {
    throw new Error('Selector repair attempt cannot be retried');
  }
  return createSelectorRepairAttempt({
    orgId,
    competitorProductId: attempt.productId,
    storeId: attempt.competitorId,
    scrapeRunId: null,
    debugArtifactId: attempt.debugArtifactId,
    triggerReason: 'manual_retry',
    status: 'parse_failed',
    selectorFailureCount: 1,
  });
}
