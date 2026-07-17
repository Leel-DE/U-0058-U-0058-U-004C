'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';
import { recordSelectorVersions } from '@/server/selectors/versioning';
import {
  cancelJobsForPayloadReference,
  cancelJobsForPayloadReferences,
} from '@/server/automation/control';

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

export const createAnalyzedStore = defineAction(
  schemas.createAnalyzedStoreSchema,
  async (input, ctx) => {
    try {
      const result = await db().transaction(async (tx) => {
        const [store] = await tx
          .insert(schema.stores)
          .values({
            orgId: ctx.orgId,
            name: input.store.name,
            domain: input.store.domain,
            countryCode: input.store.countryCode,
            currency: input.store.currency,
            crawlFrequencyMinutes: input.recommendedSettings.crawlFrequencyMinutes,
            crawlDelaySeconds: input.recommendedSettings.crawlDelaySeconds,
            respectRobots: input.recommendedSettings.respectRobots,
            jsRequired: input.recommendedSettings.jsRequired,
            discoveryPreset: input.recommendedSettings.discoveryPreset,
            discoveryDefaultsJson: input.recommendedSettings.discoveryDefaultsJson,
            notes: input.notes,
            createdBy: ctx.user.id,
          })
          .returning();
        if (!store) throw new Error('Failed to create store');

        const rules = {
          ...input.selectors.productSelectors,
          ...input.selectors.categorySelectors,
        };
        await tx.insert(schema.scrapingRules).values({
          storeId: store.id,
          titleSelector: rules.titleSelector ?? null,
          priceSelector: rules.priceSelector ?? null,
          oldPriceSelector: rules.oldPriceSelector ?? null,
          availabilitySelector: rules.availabilitySelector ?? null,
          imageSelector: rules.imageSelector ?? null,
          brandSelector: rules.brandSelector ?? null,
          skuSelector: rules.skuSelector ?? null,
          breadcrumbsSelector: rules.breadcrumbsSelector ?? null,
          productCardSelector: rules.productCardSelector ?? null,
          cardTitleSelector: rules.cardTitleSelector ?? null,
          cardPriceSelector: rules.cardPriceSelector ?? null,
          cardOldPriceSelector: rules.cardOldPriceSelector ?? null,
          cardImageSelector: rules.cardImageSelector ?? null,
          cardLinkSelector: rules.cardLinkSelector ?? null,
          cardAvailabilitySelector: rules.cardAvailabilitySelector ?? null,
          paginationNextSelector: rules.paginationNextSelector ?? null,
          loadMoreSelector: rules.loadMoreSelector ?? null,
          priceRegex: rules.priceRegex ?? null,
          useJsonLd: rules.useJsonLd ?? true,
          useOpenGraph: rules.useOpenGraph ?? true,
        });

        await tx.insert(schema.competitorProfiles).values({
          storeId: store.id,
          framework: input.profile.framework,
          renderingStrategy: input.profile.renderingStrategy,
          scrapeDifficulty: input.profile.scrapeDifficulty,
          antiBotRisk: input.profile.antiBotRisk,
          recommendedMode: input.profile.recommendedMode,
          detectionConfidence: String(input.profile.detectionConfidence),
          autoDetectedSettingsJson: input.profile.autoDetectedSettingsJson,
        });

        return store;
      });

      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'store.create_analyzed',
        entity: 'store',
        entityId: result.id,
        after: { name: result.name, domain: result.domain, profile: input.profile },
      });
      await recordSelectorVersions({
        storeId: result.id,
        selectors: {
          ...input.selectors.productSelectors,
          ...input.selectors.categorySelectors,
        },
        source: input.recommendedSettings.useAi ? 'ai_detected' : 'heuristic',
        changedBy: ctx.user.id,
        confidence: input.profile.detectionConfidence,
      }).catch((err) => console.error('[selector_versions] create_analyzed failed', err));
      revalidatePath('/competitors');
      return { id: result.id };
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
    const products = await db()
      .select({ id: schema.competitorProducts.id })
      .from(schema.competitorProducts)
      .where(
        and(
          eq(schema.competitorProducts.storeId, id),
          eq(schema.competitorProducts.orgId, ctx.orgId),
        ),
      );
    await Promise.all([
      cancelJobsForPayloadReference({ orgId: ctx.orgId, field: 'storeId', value: id }),
      cancelJobsForPayloadReferences({
        orgId: ctx.orgId,
        field: 'competitorProductId',
        values: products.map((product) => product.id),
      }),
    ]);
    const deleted = await db()
      .delete(schema.stores)
      .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
      .returning({ id: schema.stores.id, name: schema.stores.name, domain: schema.stores.domain });
    if (deleted[0]) {
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'store.delete',
        entity: 'store',
        entityId: id,
        before: { name: deleted[0].name, domain: deleted[0].domain },
      });
    }
    revalidatePath('/competitors');
    revalidatePath('/products');
    revalidatePath('/jobs');
    return { deleted: deleted.length };
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
        brandSelector: input.brandSelector ?? null,
        skuSelector: input.skuSelector ?? null,
        breadcrumbsSelector: input.breadcrumbsSelector ?? null,
        productCardSelector: input.productCardSelector ?? null,
        cardTitleSelector: input.cardTitleSelector ?? null,
        cardPriceSelector: input.cardPriceSelector ?? null,
        cardOldPriceSelector: input.cardOldPriceSelector ?? null,
        cardImageSelector: input.cardImageSelector ?? null,
        cardLinkSelector: input.cardLinkSelector ?? null,
        cardAvailabilitySelector: input.cardAvailabilitySelector ?? null,
        paginationNextSelector: input.paginationNextSelector ?? null,
        loadMoreSelector: input.loadMoreSelector ?? null,
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
          brandSelector: input.brandSelector ?? null,
          skuSelector: input.skuSelector ?? null,
          breadcrumbsSelector: input.breadcrumbsSelector ?? null,
          productCardSelector: input.productCardSelector ?? null,
          cardTitleSelector: input.cardTitleSelector ?? null,
          cardPriceSelector: input.cardPriceSelector ?? null,
          cardOldPriceSelector: input.cardOldPriceSelector ?? null,
          cardImageSelector: input.cardImageSelector ?? null,
          cardLinkSelector: input.cardLinkSelector ?? null,
          cardAvailabilitySelector: input.cardAvailabilitySelector ?? null,
          paginationNextSelector: input.paginationNextSelector ?? null,
          loadMoreSelector: input.loadMoreSelector ?? null,
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
    await recordSelectorVersions({
      storeId: input.storeId,
      selectors: input,
      source: 'manual',
      changedBy: ctx.user.id,
    }).catch((err) => console.error('[selector_versions] rules_update failed', err));
    revalidatePath(`/competitors/${input.storeId}`);
    revalidatePath(`/competitors/${input.storeId}/rules`);
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);
