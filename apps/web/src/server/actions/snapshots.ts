'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';

export const manualSnapshot = defineAction(
  schemas.manualSnapshotSchema,
  async (input, ctx) => {
    const product = await db()
      .select()
      .from(schema.competitorProducts)
      .where(
        and(
          eq(schema.competitorProducts.id, input.competitorProductId),
          eq(schema.competitorProducts.orgId, ctx.orgId),
        ),
      )
      .limit(1);
    if (!product[0]) throw new Error('Product not found');

    const last = product[0];
    const prevPrice = last.lastSnapshotPrice ? Number(last.lastSnapshotPrice) : null;
    const changed = prevPrice == null || Math.abs(prevPrice - input.price) > 0.0001;

    if (changed) {
      await db()
        .insert(schema.priceSnapshots)
        .values({
          orgId: ctx.orgId,
          competitorProductId: input.competitorProductId,
          scrapedAt: new Date(),
          price: input.price.toFixed(2),
          oldPrice: input.oldPrice ? input.oldPrice.toFixed(2) : null,
          currency: input.currency,
          availability: input.availability,
          status: 'ok',
          confidence: '1.00',
          source: 'manual',
          sourcePath: 'manual',
        });
    }

    await db()
      .update(schema.competitorProducts)
      .set({
        lastScrapedAt: new Date(),
        lastChangeAt: changed ? new Date() : last.lastChangeAt,
        lastSnapshotPrice: input.price.toFixed(2),
        lastSnapshotCurrency: input.currency,
        lastSnapshotAvailability: input.availability,
      })
      .where(eq(schema.competitorProducts.id, input.competitorProductId));

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'snapshot.manual',
      entity: 'competitor_product',
      entityId: input.competitorProductId,
      after: { price: input.price, currency: input.currency, availability: input.availability },
    });

    revalidatePath(`/competitors/products/${input.competitorProductId}`);
    return { ok: true as const, changed };
  },
  { roles: ['owner', 'manager'] },
);
