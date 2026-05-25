'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { USER_AGENT } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { serverEnv } from '@/lib/env';
import { logAudit } from '@/lib/audit';

interface ScrapeResult {
  ok: boolean;
  data?: {
    title?: string | null;
    price?: number | null;
    oldPrice?: number | null;
    currency?: string | null;
    availability?: string | null;
    imageUrl?: string | null;
    confidence?: number | null;
  };
  errorCode?: string;
  errorMessage?: string;
}

function urlHash(url: string) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

const AVAILABILITY_VALUES = new Set(['in_stock', 'out_of_stock', 'preorder', 'limited', 'unknown']);

function normalizeAvailability(value: string | null | undefined): 'in_stock' | 'out_of_stock' | 'preorder' | 'limited' | 'unknown' | null {
  if (!value) return null;
  return AVAILABILITY_VALUES.has(value) ? (value as 'in_stock' | 'out_of_stock' | 'preorder' | 'limited' | 'unknown') : null;
}

const matchByUrlInput = z.object({
  myProductId: z.string().uuid(),
  storeId: z.string().uuid(),
  url: z.string().url().max(2048),
});

/**
 * Take a competitor URL the user has identified as the same product, scrape it,
 * upsert it into competitor_products and create a confirmed product_match.
 * Returns the new competitor_product id and the scraped snapshot summary.
 */
export const matchProductByUrl = defineAction(
  matchByUrlInput,
  async (input, ctx) => {
    const env = serverEnv();

    const storeRow = await db()
      .select({ store: schema.stores, rules: schema.scrapingRules })
      .from(schema.stores)
      .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    const store = storeRow[0]?.store;
    if (!store) throw new Error('Store not found');
    const rules = storeRow[0]?.rules ?? null;

    let myProduct = await db()
      .select({ id: schema.myProducts.id })
      .from(schema.myProducts)
      .where(and(eq(schema.myProducts.id, input.myProductId), eq(schema.myProducts.orgId, ctx.orgId)))
      .limit(1);

    if (!myProduct[0]) {
      const compProduct = await db()
        .select()
        .from(schema.competitorProducts)
        .where(and(eq(schema.competitorProducts.id, input.myProductId), eq(schema.competitorProducts.orgId, ctx.orgId)))
        .limit(1);
      
      if (!compProduct[0]) {
        throw new Error('Your product was not found');
      }

      const p = compProduct[0];
      const [newMyProduct] = await db()
        .insert(schema.myProducts)
        .values({
          id: p.id,
          orgId: ctx.orgId,
          sku: p.sku ?? p.id,
          gtin: p.gtin,
          brand: p.brand,
          name: p.title || p.url,
          currency: p.lastSnapshotCurrency || 'EUR',
          imageUrl: p.imageUrl,
        })
        .returning({ id: schema.myProducts.id });

      if (!newMyProduct) {
        throw new Error('Failed to auto-create normalized product');
      }
      
      myProduct = [newMyProduct];

      // Auto-match the competitor product to the newly created normalized product
      await db()
        .insert(schema.productMatches)
        .values({
          orgId: ctx.orgId,
          myProductId: p.id,
          competitorProductId: p.id,
          method: 'manual',
          confidence: '1.000',
          status: 'confirmed',
          decidedAt: new Date(),
          decidedBy: ctx.user.id,
        })
        .onConflictDoNothing();
    }

    let scrape: ScrapeResult | null = null;
    try {
      const res = await fetch(`${env.WORKER_URL}/scrape`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
        },
        body: JSON.stringify({
          url: input.url,
          strategy: store.jsRequired ? 'playwright' : 'cheerio',
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
        }),
        signal: AbortSignal.timeout(25_000),
      });
      scrape = (await res.json()) as ScrapeResult;
    } catch (err) {
      scrape = {
        ok: false,
        errorCode: 'worker_unreachable',
        errorMessage: err instanceof Error ? err.message : 'Worker unreachable',
      };
    }

    const hash = urlHash(input.url);
    const existing = await db()
      .select({ id: schema.competitorProducts.id })
      .from(schema.competitorProducts)
      .where(
        and(
          eq(schema.competitorProducts.orgId, ctx.orgId),
          eq(schema.competitorProducts.storeId, input.storeId),
          eq(schema.competitorProducts.urlHash, hash),
        ),
      )
      .limit(1);

    const now = new Date();
    let competitorProductId = existing[0]?.id ?? null;

    if (!competitorProductId) {
      const [row] = await db()
        .insert(schema.competitorProducts)
        .values({
          orgId: ctx.orgId,
          storeId: input.storeId,
          url: input.url,
          urlHash: hash,
          title: scrape?.data?.title ?? null,
          imageUrl: scrape?.data?.imageUrl ?? null,
          lastSnapshotPrice: scrape?.data?.price != null ? scrape.data.price.toString() : null,
          lastSnapshotCurrency: scrape?.data?.currency ?? store.currency,
          lastSnapshotAvailability: scrape?.data?.availability ?? null,
          lastScrapedAt: scrape?.ok ? now : null,
          lastChangeAt: scrape?.ok ? now : null,
          nextRunAt: now,
          createdBy: ctx.user.id,
        })
        .returning({ id: schema.competitorProducts.id });
      if (!row) throw new Error('Failed to create competitor product');
      competitorProductId = row.id;
    } else if (scrape?.ok && scrape.data) {
      await db()
        .update(schema.competitorProducts)
        .set({
          title: scrape.data.title ?? undefined,
          imageUrl: scrape.data.imageUrl ?? undefined,
          lastSnapshotPrice: scrape.data.price != null ? scrape.data.price.toString() : undefined,
          lastSnapshotCurrency: scrape.data.currency ?? undefined,
          lastSnapshotAvailability: scrape.data.availability ?? undefined,
          lastScrapedAt: now,
        })
        .where(eq(schema.competitorProducts.id, competitorProductId));
    }

    if (scrape?.ok && scrape.data && competitorProductId) {
      await db()
        .insert(schema.priceSnapshots)
        .values({
          orgId: ctx.orgId,
          competitorProductId,
          scrapedAt: now,
          price: scrape.data.price != null ? scrape.data.price.toString() : null,
          oldPrice: scrape.data.oldPrice != null ? scrape.data.oldPrice.toString() : null,
          currency: scrape.data.currency ?? store.currency,
          availability: normalizeAvailability(scrape.data.availability),
          title: scrape.data.title ?? null,
          imageUrl: scrape.data.imageUrl ?? null,
          source: store.jsRequired ? 'playwright' : 'cheerio',
          confidence: scrape.data.confidence != null ? scrape.data.confidence.toString() : '0.80',
        });
    }

    if (competitorProductId) {
      await db()
        .insert(schema.productMatches)
        .values({
          orgId: ctx.orgId,
          myProductId: input.myProductId,
          competitorProductId,
          method: 'manual',
          confidence: '1.000',
          status: 'confirmed',
          decidedAt: now,
          decidedBy: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: [schema.productMatches.myProductId, schema.productMatches.competitorProductId],
          set: {
            status: 'confirmed',
            decidedAt: now,
            decidedBy: ctx.user.id,
          },
        });

      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'match.by_url',
        entity: 'product_match',
        entityId: competitorProductId,
        after: { url: input.url, scraped: scrape?.ok ?? false },
      });
    }

    revalidatePath(`/products/${input.myProductId}`);
    revalidatePath('/products');
    return {
      competitorProductId,
      scraped: Boolean(scrape?.ok),
      title: scrape?.data?.title ?? null,
      price: scrape?.data?.price ?? null,
      currency: scrape?.data?.currency ?? null,
      availability: scrape?.data?.availability ?? null,
      error: scrape?.ok ? null : scrape?.errorMessage ?? scrape?.errorCode ?? null,
    };
  },
  { roles: ['owner', 'manager'] },
);

const findCandidatesInput = z.object({
  myProductId: z.string().uuid(),
  storeIds: z.array(z.string().uuid()).max(40).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  perStoreLimit: z.number().int().min(1).max(20).optional(),
});

/**
 * Look up candidate matches for the source product inside the org's
 * already-scraped competitor_products. No external network call — uses
 * Postgres GTIN/SKU exact match + pg_trgm title similarity to rank the
 * best per-store candidates. Returns a map keyed by storeId.
 */
export const findCandidatesInScrapedData = defineAction(
  findCandidatesInput,
  async (input, ctx) => {
    const myProduct = await db()
      .select({ id: schema.myProducts.id })
      .from(schema.myProducts)
      .where(and(eq(schema.myProducts.id, input.myProductId), eq(schema.myProducts.orgId, ctx.orgId)))
      .limit(1);

    const entityType: 'normalized' | 'raw_competitor' = myProduct[0] ? 'normalized' : 'raw_competitor';

    const { findCrossStoreCandidates } = await import('@/server/products/queries');
    const grouped = await findCrossStoreCandidates(ctx.orgId, input.myProductId, entityType, {
      storeIds: input.storeIds,
      perStoreLimit: input.perStoreLimit,
      minSimilarity: input.minSimilarity,
    });
    return { byStore: grouped };
  },
  { roles: ['owner', 'manager', 'viewer'] },
);
