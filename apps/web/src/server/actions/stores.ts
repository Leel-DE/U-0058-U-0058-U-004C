'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';

export const createStore = defineAction(
  schemas.createStoreSchema,
  async (input, ctx) => {
    try {
      const [store] = await db()
        .insert(schema.stores)
        .values({
          orgId: ctx.orgId,
          name: input.name,
          domain: input.domain,
          countryCode: input.countryCode,
          currency: input.currency,
          crawlFrequencyMinutes: input.crawlFrequencyMinutes,
          crawlDelaySeconds: input.crawlDelaySeconds,
          respectRobots: input.respectRobots,
          jsRequired: input.jsRequired,
          notes: input.notes,
          createdBy: ctx.user.id,
        })
        .returning();
      if (!store) throw new Error('Failed to create store');

      await db()
        .insert(schema.scrapingRules)
        .values({ storeId: store.id, useJsonLd: true, useOpenGraph: true });

      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'store.create',
        entity: 'store',
        entityId: store.id,
        after: { name: store.name, domain: store.domain },
      });
      revalidatePath('/competitors');
      return { id: store.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('stores_org_domain_unique')) {
        throw new Error('A store with this domain already exists in your organization.');
      }
      throw err;
    }
  },
  { roles: ['owner', 'manager'] },
);

export const updateStore = defineAction(
  schemas.updateStoreSchema,
  async (input, ctx) => {
    const { id, ...rest } = input;
    await db()
      .update(schema.stores)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)));
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'store.update',
      entity: 'store',
      entityId: id,
      after: rest,
    });
    revalidatePath('/competitors');
    revalidatePath(`/competitors/${id}`);
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);

const deleteSchema = z.object({ id: z.string().uuid() });
export const deleteStore = defineAction(
  deleteSchema,
  async ({ id }, ctx) => {
    await db()
      .delete(schema.stores)
      .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)));
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'store.delete',
      entity: 'store',
      entityId: id,
    });
    revalidatePath('/competitors');
    return { ok: true as const };
  },
  { roles: ['owner'] },
);

export const updateScrapingRules = defineAction(
  schemas.scrapingRulesSchema,
  async (input, ctx) => {
    // verify ownership
    const owned = await db()
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!owned[0]) throw new Error('Forbidden — store not in this organization');

    await db()
      .insert(schema.scrapingRules)
      .values({
        storeId: input.storeId,
        titleSelector: input.titleSelector ?? null,
        priceSelector: input.priceSelector ?? null,
        oldPriceSelector: input.oldPriceSelector ?? null,
        availabilitySelector: input.availabilitySelector ?? null,
        imageSelector: input.imageSelector ?? null,
        shippingSelector: input.shippingSelector ?? null,
        ratingSelector: input.ratingSelector ?? null,
        priceRegex: input.priceRegex ?? null,
        useJsonLd: input.useJsonLd,
        useOpenGraph: input.useOpenGraph,
      })
      .onConflictDoUpdate({
        target: schema.scrapingRules.storeId,
        set: {
          titleSelector: input.titleSelector ?? null,
          priceSelector: input.priceSelector ?? null,
          oldPriceSelector: input.oldPriceSelector ?? null,
          availabilitySelector: input.availabilitySelector ?? null,
          imageSelector: input.imageSelector ?? null,
          shippingSelector: input.shippingSelector ?? null,
          ratingSelector: input.ratingSelector ?? null,
          priceRegex: input.priceRegex ?? null,
          useJsonLd: input.useJsonLd,
          useOpenGraph: input.useOpenGraph,
          updatedAt: new Date(),
        },
      });

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'store.rules_update',
      entity: 'store',
      entityId: input.storeId,
      after: input,
    });
    revalidatePath(`/competitors/${input.storeId}`);
    revalidatePath(`/competitors/${input.storeId}/rules`);
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);
