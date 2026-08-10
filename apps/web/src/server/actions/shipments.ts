'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { serverEnv } from '@/lib/env';
import { cancelJobsForPayloadReference } from '@/server/automation/control';

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
  respectRobotsTxt: z.boolean().default(false),
  forceJavaScript: z.boolean().default(true),
  useAi: z.boolean().default(true),
  useManualCaptcha: z.boolean().default(false),
});

const trackingSettingsSchema = z.object({
  shipmentId: z.string().uuid(),
  respectRobotsTxt: z.boolean(),
  forceJavaScript: z.boolean(),
  useAi: z.boolean(),
  useManualCaptcha: z.boolean(),
  /** Fixed check interval in minutes; null keeps the adaptive schedule. */
  checkIntervalMinutes: z.number().int().min(15).max(10_080).nullable().default(null),
});

const manualSessionRefSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(['ups', 'postal_ninja', 'parcelsapp', 'ship24', '17track', 'yanwen']),
  label: z.string().min(1),
});

function manualSessionFromResult(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const parsed = manualSessionRefSchema.safeParse((value as Record<string, unknown>).manualSession);
  return parsed.success ? parsed.data : null;
}

async function focusWorkerSession(sessionId: string) {
  const env = serverEnv();
  const response = await fetch(`${env.WORKER_URL}/scrape/manual-session/focus`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
    },
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error('Manual CAPTCHA window is no longer available. Run the check again.');
}

function queueValues(input: {
  orgId: string;
  shipmentId: string;
  trackingNumber: string;
  userId?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  settings: {
    respectRobotsTxt: boolean;
    forceJavaScript: boolean;
    useAi: boolean;
    useManualCaptcha: boolean;
  };
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
      respectRobotsTxt: input.settings.respectRobotsTxt,
      forceJavaScript: input.settings.forceJavaScript,
      useAi: input.settings.useAi,
      manualContinuation: input.settings.useManualCaptcha,
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
        respectRobotsTxt: input.respectRobotsTxt,
        forceJavaScript: input.forceJavaScript,
        useAi: input.useAi,
        useManualCaptcha: input.useManualCaptcha,
        createdBy: ctx.user.id,
      });
      await tx.insert(schema.automationJobs).values(
        queueValues({
          orgId: ctx.orgId,
          shipmentId: id,
          trackingNumber: input.trackingNumber.replace(/\s+/g, '').toUpperCase(),
          userId: ctx.user.id,
          settings: input,
        }),
      );
    });
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.create',
      entity: 'shipment',
      entityId: id,
      after: {
        trackingNumber: input.trackingNumber,
        respectRobotsTxt: input.respectRobotsTxt,
        forceJavaScript: input.forceJavaScript,
        useAi: input.useAi,
        useManualCaptcha: input.useManualCaptcha,
      },
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
        await tx.insert(schema.shipments).values({
          id,
          orgId: ctx.orgId,
          trackingNumber,
          respectRobotsTxt: false,
          forceJavaScript: true,
          useAi: true,
          useManualCaptcha: false,
          createdBy: ctx.user.id,
        });
        await tx.insert(schema.automationJobs).values(
          queueValues({
            orgId: ctx.orgId,
            shipmentId: id,
            trackingNumber,
            userId: ctx.user.id,
            settings: {
              respectRobotsTxt: false,
              forceJavaScript: true,
              useAi: true,
              useManualCaptcha: false,
            },
          }),
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
      .select({
        id: schema.shipments.id,
        trackingNumber: schema.shipments.trackingNumber,
        trackingEnabled: schema.shipments.trackingEnabled,
        respectRobotsTxt: schema.shipments.respectRobotsTxt,
        forceJavaScript: schema.shipments.forceJavaScript,
        useAi: schema.shipments.useAi,
        useManualCaptcha: schema.shipments.useManualCaptcha,
      })
      .from(schema.shipments)
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.orgId, ctx.orgId)))
      .limit(1);
    if (!shipment) throw new Error('Shipment not found');
    if (!shipment.trackingEnabled) throw new Error('Shipment tracking is disabled');
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
          settings: shipment,
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

export const markShipmentDelivered = defineAction(
  z.object({ shipmentId: z.string().uuid() }),
  async (input, ctx) => {
    const [existing] = await db()
      .select({
        id: schema.shipments.id,
        trackingNumber: schema.shipments.trackingNumber,
        currentStatus: schema.shipments.currentStatus,
        trackingEnabled: schema.shipments.trackingEnabled,
        deliveredAt: schema.shipments.deliveredAt,
      })
      .from(schema.shipments)
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.orgId, ctx.orgId)))
      .limit(1);
    if (!existing) throw new Error('Shipment not found');

    const cancelledJobIds = await cancelJobsForPayloadReference({
      orgId: ctx.orgId,
      field: 'shipmentId',
      value: existing.id,
      reason: {
        errorCode: 'tracking_stopped',
        errorSummary: 'Shipment was marked delivered by an operator.',
      },
    });

    const deliveredAt = existing.deliveredAt ?? new Date();
    await db().transaction(async (tx) => {
      await tx
        .update(schema.shipments)
        .set({
          ...(existing.currentStatus !== 'delivered'
            ? { previousStatus: existing.currentStatus }
            : {}),
          currentStatus: 'delivered',
          statusTitle: 'Доставлено вручную',
          statusDescription:
            'Отмечено оператором как доставленное. Автоматическое отслеживание остановлено.',
          trackingEnabled: false,
          deliveredAt,
          lastEventAt: deliveredAt,
          nextCheckAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.shipments.id, existing.id), eq(schema.shipments.orgId, ctx.orgId)));

      if (existing.currentStatus !== 'delivered' || existing.trackingEnabled) {
        await tx.insert(schema.shipmentEvents).values({
          orgId: ctx.orgId,
          shipmentId: existing.id,
          status: 'delivered',
          title: 'Доставлено вручную',
          description: 'Оператор подтвердил доставку и остановил автоматическое отслеживание.',
          eventAt: deliveredAt,
          eventHash: `manual-delivered:${randomUUID()}`,
        });
      }
    });

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.mark_delivered',
      entity: 'shipment',
      entityId: existing.id,
      before: {
        status: existing.currentStatus,
        trackingEnabled: existing.trackingEnabled,
      },
      after: {
        status: 'delivered',
        trackingEnabled: false,
        cancelledJobIds,
      },
    });
    revalidatePath('/shipments');
    revalidatePath(`/shipments/${existing.id}`);
    revalidatePath('/jobs');
    return { id: existing.id, cancelledJobs: cancelledJobIds.length };
  },
  { roles: ['owner', 'manager'] },
);

export const deleteShipment = defineAction(
  z.object({ shipmentId: z.string().uuid() }),
  async (input, ctx) => {
    const [existing] = await db()
      .select({
        id: schema.shipments.id,
        trackingNumber: schema.shipments.trackingNumber,
        displayName: schema.shipments.displayName,
        currentStatus: schema.shipments.currentStatus,
      })
      .from(schema.shipments)
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.orgId, ctx.orgId)))
      .limit(1);
    if (!existing) throw new Error('Shipment not found');

    await cancelJobsForPayloadReference({
      orgId: ctx.orgId,
      field: 'shipmentId',
      value: existing.id,
    });

    const shipmentReference = sql<string>`${schema.automationJobs.payloadJson} ->> 'shipmentId'`;
    await db().transaction(async (tx) => {
      await tx
        .delete(schema.automationJobs)
        .where(and(eq(schema.automationJobs.orgId, ctx.orgId), eq(shipmentReference, existing.id)));
      await tx
        .delete(schema.shipments)
        .where(and(eq(schema.shipments.id, existing.id), eq(schema.shipments.orgId, ctx.orgId)));
    });

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.delete',
      entity: 'shipment',
      entityId: existing.id,
      before: {
        trackingNumber: existing.trackingNumber,
        displayName: existing.displayName,
        status: existing.currentStatus,
      },
    });
    revalidatePath('/shipments');
    revalidatePath('/jobs');
    return { id: existing.id };
  },
  { roles: ['owner'] },
);

export const updateShipmentTrackingSettings = defineAction(
  trackingSettingsSchema,
  async (input, ctx) => {
    const [shipment] = await db()
      .update(schema.shipments)
      .set({
        respectRobotsTxt: input.respectRobotsTxt,
        forceJavaScript: input.forceJavaScript,
        useAi: input.useAi,
        useManualCaptcha: input.useManualCaptcha,
        checkIntervalOverrideMinutes: input.checkIntervalMinutes,
        // A pinned interval reschedules the next check from now, so the chosen
        // cadence takes effect immediately. Adaptive mode keeps the current
        // schedule until the next completed check recomputes it from status.
        ...(input.checkIntervalMinutes
          ? {
              checkIntervalMinutes: input.checkIntervalMinutes,
              nextCheckAt: new Date(Date.now() + input.checkIntervalMinutes * 60_000),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.shipments.id, input.shipmentId), eq(schema.shipments.orgId, ctx.orgId)))
      .returning({ id: schema.shipments.id });
    if (!shipment) throw new Error('Shipment not found');
    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'shipment.tracking_settings.update',
      entity: 'shipment',
      entityId: shipment.id,
      after: {
        respectRobotsTxt: input.respectRobotsTxt,
        forceJavaScript: input.forceJavaScript,
        useAi: input.useAi,
        useManualCaptcha: input.useManualCaptcha,
        checkIntervalMinutes: input.checkIntervalMinutes,
      },
    });
    revalidatePath(`/shipments/${shipment.id}`);
    return { id: shipment.id };
  },
  { roles: ['owner', 'manager'] },
);

export const resumeCaptchaJob = defineAction(
  z.object({ jobId: z.string().uuid() }),
  async (input, ctx) => {
    const [job] = await db()
      .select({
        id: schema.automationJobs.id,
        payloadJson: schema.automationJobs.payloadJson,
        resultJson: schema.automationJobs.resultJson,
      })
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
    const manualSession = manualSessionFromResult(job.resultJson);
    if (!manualSession) throw new Error('Manual CAPTCHA session not found');
    await db()
      .update(schema.automationJobs)
      .set({
        status: 'queued',
        payloadJson: {
          ...job.payloadJson,
          providerIds: [manualSession.provider],
          manualContinuation: true,
          manualSessionId: manualSession.id,
          manualProvider: manualSession.provider,
        },
        scheduledAt: new Date(),
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.automationJobs.id, job.id));
    revalidatePath('/jobs');
    revalidatePath(`/jobs/${job.id}`);
    if (typeof job.payloadJson.shipmentId === 'string') {
      revalidatePath(`/shipments/${job.payloadJson.shipmentId}`);
    }
    return { jobId: job.id };
  },
  { roles: ['owner', 'manager'] },
);

export const openCaptchaBrowser = defineAction(
  z.object({ jobId: z.string().uuid() }),
  async (input, ctx) => {
    const [job] = await db()
      .select({ resultJson: schema.automationJobs.resultJson })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.id, input.jobId),
          eq(schema.automationJobs.orgId, ctx.orgId),
          eq(schema.automationJobs.status, 'awaiting_user'),
        ),
      )
      .limit(1);
    const manualSession = manualSessionFromResult(job?.resultJson);
    if (!manualSession) throw new Error('Manual CAPTCHA session not found');
    await focusWorkerSession(manualSession.id);
    return { jobId: input.jobId, sessionId: manualSession.id };
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
