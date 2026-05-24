'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { persistSuggestions } from '@/server/matching/suggest';
import { logAudit } from '@/lib/audit';

export const refreshMatchSuggestions = defineAction(
  z.object({}),
  async (_input, ctx) => {
    const n = await persistSuggestions(ctx.orgId);
    revalidatePath('/matches');
    return { suggested: n };
  },
  { roles: ['owner', 'manager'] },
);

export const createMatch = defineAction(
  schemas.createMatchSchema,
  async (input, ctx) => {
    const [row] = await db()
      .insert(schema.productMatches)
      .values({
        orgId: ctx.orgId,
        myProductId: input.myProductId,
        competitorProductId: input.competitorProductId,
        method: 'manual',
        confidence: '1.000',
        status: 'confirmed',
        decidedAt: new Date(),
        decidedBy: ctx.user.id,
      })
      .onConflictDoUpdate({
        target: [schema.productMatches.myProductId, schema.productMatches.competitorProductId],
        set: {
          status: 'confirmed',
          decidedAt: new Date(),
          decidedBy: ctx.user.id,
        },
      })
      .returning();
    if (!row) throw new Error('Failed to create match');
    revalidatePath('/matches');
    return { id: row.id };
  },
  { roles: ['owner', 'manager'] },
);

const decisionSchema = z.object({ matchId: z.string().uuid() });

export const confirmMatch = defineAction(
  decisionSchema,
  async ({ matchId }, ctx) => {
    await db()
      .update(schema.productMatches)
      .set({ status: 'confirmed', decidedAt: new Date(), decidedBy: ctx.user.id })
      .where(
        and(
          eq(schema.productMatches.id, matchId),
          eq(schema.productMatches.orgId, ctx.orgId),
        ),
      );
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'match.confirm',
      entity: 'product_match',
      entityId: matchId,
    });
    revalidatePath('/matches');
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);

export const rejectMatch = defineAction(
  decisionSchema,
  async ({ matchId }, ctx) => {
    await db()
      .update(schema.productMatches)
      .set({ status: 'rejected', decidedAt: new Date(), decidedBy: ctx.user.id })
      .where(
        and(
          eq(schema.productMatches.id, matchId),
          eq(schema.productMatches.orgId, ctx.orgId),
        ),
      );
    revalidatePath('/matches');
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);
