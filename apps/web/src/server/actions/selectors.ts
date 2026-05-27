'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { db, schema } from '@/lib/db';
import { applySelectorRepair } from '@/server/selectors/apply-selector-repair';
import { retrySelectorRepairAttempt } from '@/server/selectors/create-selector-repair-attempt';
import { rollbackSelectorVersion } from '@/server/selectors/versioning';

export const rollbackSelectorVersionAction = defineAction(
  z.object({ selectorVersionId: z.string().uuid() }),
  async (input, ctx) => {
    const rows = await db()
      .select({ storeId: schema.selectorVersions.storeId })
      .from(schema.selectorVersions)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.selectorVersions.storeId))
      .where(and(eq(schema.selectorVersions.id, input.selectorVersionId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!rows[0]) throw new Error('Selector version not found');
    const result = await rollbackSelectorVersion({
      selectorVersionId: input.selectorVersionId,
      changedBy: ctx.user.id,
    });
    revalidatePath('/debug/selectors');
    revalidatePath(`/competitors/${result.storeId}/rules`);
    return result;
  },
  { roles: ['owner', 'manager'] },
);

export const applySelectorRepairAction = defineAction(
  z.object({ attemptId: z.string().uuid() }),
  async (input, ctx) => {
    const result = await applySelectorRepair({
      orgId: ctx.orgId,
      attemptId: input.attemptId,
      changedBy: ctx.user.id,
      requireAutoThreshold: false,
    });
    revalidatePath('/debug/selectors/repairs');
    revalidatePath('/debug/selectors');
    return result;
  },
  { roles: ['owner', 'manager'] },
);

export const rejectSelectorRepairAction = defineAction(
  z.object({ attemptId: z.string().uuid() }),
  async (input, ctx) => {
    await db()
      .update(schema.selectorRepairAttempts)
      .set({ status: 'failed', error: 'rejected by user', updatedAt: new Date() })
      .where(and(eq(schema.selectorRepairAttempts.id, input.attemptId), eq(schema.selectorRepairAttempts.orgId, ctx.orgId)));
    revalidatePath('/debug/selectors/repairs');
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);

export const retrySelectorRepairAction = defineAction(
  z.object({ attemptId: z.string().uuid() }),
  async (input, ctx) => {
    const result = await retrySelectorRepairAttempt(ctx.orgId, input.attemptId);
    revalidatePath('/debug/selectors/repairs');
    return result;
  },
  { roles: ['owner', 'manager'] },
);
