'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';

export const createAlertRule = defineAction(
  schemas.createAlertRuleSchema,
  async (input, ctx) => {
    const [row] = await db()
      .insert(schema.alertRules)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        type: input.type,
        params: input.params ?? {},
        scopeMyProductId: input.scope?.myProductId,
        scopeCompetitorProductId: input.scope?.competitorProductId,
        scopeStoreId: input.scope?.storeId,
        channels: input.channels,
        active: input.active,
        createdBy: ctx.user.id,
      })
      .returning();
    if (!row) throw new Error('Failed to create alert rule');

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'alert_rule.create',
      entity: 'alert_rule',
      entityId: row.id,
      after: { name: input.name, type: input.type },
    });
    revalidatePath('/alerts');
    return { id: row.id };
  },
  { roles: ['owner', 'manager'] },
);

const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleAlertRule = defineAction(
  toggleSchema,
  async ({ id, active }, ctx) => {
    await db()
      .update(schema.alertRules)
      .set({ active })
      .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, ctx.orgId)));
    revalidatePath('/alerts');
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);

const deleteSchema = z.object({ id: z.string().uuid() });
export const deleteAlertRule = defineAction(
  deleteSchema,
  async ({ id }, ctx) => {
    await db()
      .delete(schema.alertRules)
      .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.orgId, ctx.orgId)));
    revalidatePath('/alerts');
    return { ok: true as const };
  },
  { roles: ['owner'] },
);

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });
export const markNotificationsRead = defineAction(
  markReadSchema,
  async ({ ids }, ctx) => {
    await db()
      .update(schema.notifications)
      .set({ readAt: new Date(), status: 'read' })
      .where(
        and(
          eq(schema.notifications.userId, ctx.user.id),
          eq(schema.notifications.orgId, ctx.orgId),
          sql`id = ANY(${ids})`,
        ),
      );
    revalidatePath('/alerts');
    return { ok: true as const };
  },
);
