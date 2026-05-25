'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { db, schema } from '@/lib/db';
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
