'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';

const triggerSchema = z.union([
  z.object({ competitorProductId: z.string().uuid() }),
  z.object({ storeId: z.string().uuid() }),
]);

export const triggerScrape = defineAction(
  triggerSchema,
  async (input, ctx) => {
    if ('competitorProductId' in input) {
      const [product] = await db()
        .select({ id: schema.competitorProducts.id })
        .from(schema.competitorProducts)
        .where(
          and(
            eq(schema.competitorProducts.id, input.competitorProductId),
            eq(schema.competitorProducts.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!product) throw new Error('Product not found');
      const [active] = await db()
        .select({ id: schema.automationJobs.id })
        .from(schema.automationJobs)
        .where(
          and(
            eq(schema.automationJobs.orgId, ctx.orgId),
            eq(schema.automationJobs.dedupeKey, `competitor:${product.id}`),
            inArray(schema.automationJobs.status, ['queued', 'running', 'awaiting_user']),
          ),
        )
        .limit(1);
      if (active) return { queued: true as const, jobId: active.id, alreadyQueued: true };
      const [job] = await db()
        .insert(schema.automationJobs)
        .values({
          orgId: ctx.orgId,
          type: 'competitor_scrape',
          priority: 'high',
          payloadJson: { inputVersion: 1, competitorProductId: product.id },
          dedupeKey: `competitor:${product.id}`,
          createdBy: ctx.user.id,
        })
        .returning({ id: schema.automationJobs.id });
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'scrape.queue_product',
        entity: 'competitor_product',
        entityId: product.id,
        after: { jobId: job!.id },
      });
      revalidatePath(`/competitors/products/${product.id}`);
      return { queued: true as const, jobId: job!.id, alreadyQueued: false };
    }

    const [store] = await db()
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!store) throw new Error('Store not found');
    const products = await db()
      .select({ id: schema.competitorProducts.id })
      .from(schema.competitorProducts)
      .where(
        and(
          eq(schema.competitorProducts.storeId, store.id),
          eq(schema.competitorProducts.orgId, ctx.orgId),
          eq(schema.competitorProducts.active, true),
        ),
      );
    const runId = randomUUID();
    await db().transaction(async (tx) => {
      await tx
        .insert(schema.scrapeRuns)
        .values({
          id: runId,
          orgId: ctx.orgId,
          storeId: store.id,
          triggeredBy: 'manual',
          status: 'queued',
          productsTotal: products.length,
        });
      if (products.length > 0)
        await tx
          .insert(schema.automationJobs)
          .values(
            products.map((product) => ({
              orgId: ctx.orgId,
              type: 'competitor_scrape' as const,
              priority: 'high' as const,
              payloadJson: { inputVersion: 1, competitorProductId: product.id, scrapeRunId: runId },
              dedupeKey: `competitor:${product.id}`,
              createdBy: ctx.user.id,
            })),
          )
          .onConflictDoNothing();
    });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'scrape.queue_store',
      entity: 'store',
      entityId: store.id,
      after: { runId, jobCount: products.length },
    });
    revalidatePath(`/competitors/${store.id}`);
    revalidatePath('/jobs');
    return { queued: true as const, runId, jobCount: products.length };
  },
  { roles: ['owner', 'manager'] },
);
