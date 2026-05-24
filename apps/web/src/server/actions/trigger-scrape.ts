'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { inngest } from '@/lib/inngest/client';
import { runScrapeForProduct } from '@/server/scrape/run-product';
import { logAudit } from '@/lib/audit';

const triggerSchema = z.union([
  z.object({ competitorProductId: z.string().uuid() }),
  z.object({ storeId: z.string().uuid() }),
]);

export const triggerScrape = defineAction(
  triggerSchema,
  async (input, ctx) => {
    if ('competitorProductId' in input) {
      // Verify ownership
      const owned = await db()
        .select({ id: schema.competitorProducts.id })
        .from(schema.competitorProducts)
        .where(
          and(
            eq(schema.competitorProducts.id, input.competitorProductId),
            eq(schema.competitorProducts.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!owned[0]) throw new Error('Product not found');

      // Run synchronously (the user is waiting). For longer queues we'd send an event instead.
      const result = await runScrapeForProduct({
        orgId: ctx.orgId,
        competitorProductId: input.competitorProductId,
      });
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'scrape.trigger_product',
        entity: 'competitor_product',
        entityId: input.competitorProductId,
        after: result,
      });
      revalidatePath(`/competitors/products/${input.competitorProductId}`);
      return result;
    }

    // store-level trigger → enqueue via Inngest
    const owned = await db()
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!owned[0]) throw new Error('Store not found');
    const runId = randomUUID();
    await inngest.send({
      name: 'store.scrape.requested',
      data: { orgId: ctx.orgId, storeId: input.storeId, runId },
    });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'scrape.trigger_store',
      entity: 'store',
      entityId: input.storeId,
      after: { runId },
    });
    revalidatePath(`/competitors/${input.storeId}`);
    return { ok: true as const, runId };
  },
  { roles: ['owner', 'manager'] },
);
