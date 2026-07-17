'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';
import { activeAutomationStatuses, interruptLocalWorker } from '@/server/automation/control';

const jobIdSchema = z.object({ jobId: z.string().uuid() });
const stopAllSchema = z.object({ confirmation: z.literal('STOP ALL JOBS') });
const deleteAllSchema = z.object({ confirmation: z.literal('DELETE ALL JOBS') });

function revalidateAutomation() {
  revalidatePath('/automation');
  revalidatePath('/jobs');
  revalidatePath('/dead-letter');
}

export const cancelAutomationJob = defineAction(
  jobIdSchema,
  async ({ jobId }, ctx) => {
    const cancelled = await db()
      .update(schema.automationJobs)
      .set({
        status: 'cancelled',
        finishedAt: new Date(),
        errorCode: 'cancelled_by_user',
        errorSummary: 'The job was stopped by an operator.',
        leaseOwner: null,
        leaseToken: null,
        leasedUntil: null,
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.automationJobs.id, jobId),
          eq(schema.automationJobs.orgId, ctx.orgId),
          inArray(schema.automationJobs.status, [...activeAutomationStatuses]),
        ),
      )
      .returning({ id: schema.automationJobs.id, type: schema.automationJobs.type });
    if (cancelled[0]) {
      await interruptLocalWorker(ctx.orgId, [cancelled[0].id]);
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'automation_job.cancel',
        entity: 'automation_job',
        entityId: cancelled[0].id,
        before: { type: cancelled[0].type },
      });
    }
    revalidateAutomation();
    return { cancelled: cancelled.length };
  },
  { roles: ['owner', 'manager'] },
);

export const cancelAllAutomationJobs = defineAction(
  stopAllSchema,
  async (_, ctx) => {
    const cancelled = await db()
      .update(schema.automationJobs)
      .set({
        status: 'cancelled',
        finishedAt: new Date(),
        errorCode: 'cancelled_by_user',
        errorSummary: 'The job was stopped by an operator.',
        leaseOwner: null,
        leaseToken: null,
        leasedUntil: null,
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.automationJobs.orgId, ctx.orgId),
          inArray(schema.automationJobs.status, [...activeAutomationStatuses]),
        ),
      )
      .returning({ id: schema.automationJobs.id });
    const worker = await interruptLocalWorker(ctx.orgId);
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'automation_job.cancel_all',
      entity: 'automation_job',
      after: { cancelled: cancelled.length, workerInterrupted: worker.interrupted },
    });
    revalidateAutomation();
    return { cancelled: cancelled.length, workerReachable: worker.reachable };
  },
  { roles: ['owner'] },
);

export const deleteAutomationJob = defineAction(
  jobIdSchema,
  async ({ jobId }, ctx) => {
    const deleted = await db()
      .delete(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.id, jobId),
          eq(schema.automationJobs.orgId, ctx.orgId),
          inArray(schema.automationJobs.status, [
            'succeeded',
            'partial',
            'failed',
            'dead_letter',
            'cancelled',
          ]),
        ),
      )
      .returning({ id: schema.automationJobs.id });
    if (deleted[0]) {
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'automation_job.delete',
        entity: 'automation_job',
        entityId: deleted[0].id,
      });
    }
    revalidateAutomation();
    return { deleted: deleted.length };
  },
  { roles: ['owner'] },
);

export const deleteAllAutomationJobs = defineAction(
  deleteAllSchema,
  async (_, ctx) => {
    const active = await db()
      .select({ id: schema.automationJobs.id })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.orgId, ctx.orgId),
          inArray(schema.automationJobs.status, [...activeAutomationStatuses]),
        ),
      )
      .limit(1);
    if (active.length > 0) return { deleted: 0, blocked: true as const };

    const deleted = await db()
      .delete(schema.automationJobs)
      .where(eq(schema.automationJobs.orgId, ctx.orgId))
      .returning({ id: schema.automationJobs.id });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'automation_job.delete_all',
      entity: 'automation_job',
      after: { deleted: deleted.length },
    });
    revalidateAutomation();
    return { deleted: deleted.length, blocked: false as const };
  },
  { roles: ['owner'] },
);
