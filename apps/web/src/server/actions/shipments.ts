'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/audit';

const trackingNumberSchema = z
  .string()
  .trim()
  .min(4)
  .max(100)
  .regex(/^[A-Za-z0-9._\- ]+$/, 'Use letters, digits, dots, dashes or spaces.');

const createShipmentSchema = z.object({
  trackingNumber: trackingNumberSchema,
  displayName: z.string().trim().max(120).optional(),
  carrierHint: z.string().trim().max(80).optional(),
  originCountry: z.string().trim().length(2).toUpperCase().optional().or(z.literal('')),
  destinationCountry: z.string().trim().length(2).toUpperCase().optional().or(z.literal('')),
});

function queueValues(input: {
  orgId: string;
  shipmentId: string;
  trackingNumber: string;
  userId?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}) {
  return {
    orgId: input.orgId,
    type: 'shipment_tracking' as const,
    priority: input.priority ?? ('high' as const),
    status: 'queued' as const,
    payloadJson: {
      inputVersion: 1,
      shipmentId: input.shipmentId,
      trackingNumber: input.trackingNumber,
      manualContinuation: true,
    },
    dedupeKey: `shipment:${input.shipmentId}`,
    createdBy: input.userId,
  };
}

export const createShipment = defineAction(
  createShipmentSchema,
  async (input, ctx) => {
    const id = randomUUID();
    await db().transaction(async (tx) => {
      await tx.insert(schema.shipments).values({
        id,
        orgId: ctx.orgId,
        trackingNumber: input.trackingNumber.replace(/\s+/g, '').toUpperCase(),
        displayName: input.displayName || null,
        carrierHint: input.carrierHint || null,
        originCountry: input.originCountry || null,
        destinationCountry: input.destinationCountry || null,
        createdBy: ctx.user.id,
      });
      await tx.insert(schema.automationJobs).values(
        queueValues({
          orgId: ctx.orgId,
          shipmentId: id,
          trackingNumber: input.trackingNumber.replace(/\s+/g, '').toUpperCase(),
          userId: ctx.user.id,
        }),
      );
    });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.create',
      entity: 'shipment',
      entityId: id,
      after: { trackingNumber: input.trackingNumber },
    });
    revalidatePath('/shipments');
    return { id };
  },
  { roles: ['owner', 'manager'] },
);

export const bulkCreateShipments = defineAction(
  z.object({
    trackingNumbers: z.array(trackingNumberSchema).min(1).max(100),
  }),
  async (input, ctx) => {
    const unique = [
      ...new Set(input.trackingNumbers.map((value) => value.replace(/\s+/g, '').toUpperCase())),
    ];
    let created = 0;
    let duplicates = 0;
    for (const trackingNumber of unique) {
      const existing = await db()
        .select({ id: schema.shipments.id })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.orgId, ctx.orgId),
            eq(schema.shipments.trackingNumber, trackingNumber),
          ),
        )
        .limit(1);
      if (existing[0]) {
        duplicates += 1;
        continue;
      }
      const id = randomUUID();
      await db().transaction(async (tx) => {
        await tx
          .insert(schema.shipments)
          .values({ id, orgId: ctx.orgId, trackingNumber, createdBy: ctx.user.id });
        await tx
          .insert(schema.automationJobs)
          .values(
            queueValues({ orgId: ctx.orgId, shipmentId: id, trackingNumber, userId: ctx.user.id }),
          );
      });
      created += 1;
    }
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.bulk_create',
      entity: 'shipment',
      after: { created, duplicates },
    });
    revalidatePath('/shipments');
    return { created, duplicates };
  },
  { roles: ['owner', 'manager'] },
);

export const enqueueShipmentCheck = defineAction(
  z.object({ shipmentId: z.string().uuid() }),
  async (input, ctx) => {
    const [shipment] = await db()
      .select({ id: schema.shipments.id, trackingNumber: schema.shipments.trackingNumber })
      .from(schema.shipments)
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.orgId, ctx.orgId)))
      .limit(1);
    if (!shipment) throw new Error('Shipment not found');
    const existing = await db()
      .select({ id: schema.automationJobs.id })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.orgId, ctx.orgId),
          eq(schema.automationJobs.dedupeKey, `shipment:${shipment.id}`),
          inArray(schema.automationJobs.status, ['queued', 'running', 'awaiting_user']),
        ),
      )
      .limit(1);
    if (existing[0]) return { jobId: existing[0].id, alreadyQueued: true };
    const [job] = await db()
      .insert(schema.automationJobs)
      .values(
        queueValues({
          orgId: ctx.orgId,
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          userId: ctx.user.id,
          priority: 'critical',
        }),
      )
      .returning({ id: schema.automationJobs.id });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.check_requested',
      entity: 'shipment',
      entityId: shipment.id,
      after: { jobId: job!.id },
    });
    revalidatePath(`/shipments/${shipment.id}`);
    revalidatePath('/jobs');
    return { jobId: job!.id, alreadyQueued: false };
  },
  { roles: ['owner', 'manager'] },
);

export const resumeCaptchaJob = defineAction(
  z.object({ jobId: z.string().uuid() }),
  async (input, ctx) => {
    const [job] = await db()
      .select({ id: schema.automationJobs.id })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.id, input.jobId),
          eq(schema.automationJobs.orgId, ctx.orgId),
          eq(schema.automationJobs.status, 'awaiting_user'),
        ),
      )
      .limit(1);
    if (!job) throw new Error('Awaiting job not found');
    await db()
      .update(schema.automationJobs)
      .set({ status: 'queued', scheduledAt: new Date(), finishedAt: null, updatedAt: new Date() })
      .where(eq(schema.automationJobs.id, job.id));
    revalidatePath('/jobs');
    return { jobId: job.id };
  },
  { roles: ['owner', 'manager'] },
);

export const replayDeadLetterJob = defineAction(
  z.object({ jobId: z.string().uuid() }),
  async (input, ctx) => {
    const [job] = await db()
      .select({ id: schema.automationJobs.id, type: schema.automationJobs.type })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.id, input.jobId),
          eq(schema.automationJobs.orgId, ctx.orgId),
          eq(schema.automationJobs.status, 'dead_letter'),
        ),
      )
      .limit(1);
    if (!job) throw new Error('Dead-letter job not found');
    await db()
      .update(schema.automationJobs)
      .set({
        status: 'queued',
        attemptCount: 0,
        scheduledAt: new Date(),
        finishedAt: null,
        errorCode: null,
        errorSummary: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.automationJobs.id, job.id));
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'automation_job.replay',
      entity: 'automation_job',
      entityId: job.id,
      after: { type: job.type },
    });
    revalidatePath('/dead-letter');
    revalidatePath('/jobs');
    return { jobId: job.id };
  },
  { roles: ['owner'] },
);
