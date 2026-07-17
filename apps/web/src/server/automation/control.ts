import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const activeAutomationStatuses = ['queued', 'running', 'awaiting_user'] as const;

export async function interruptLocalWorker(orgId: string, jobIds?: string[]) {
  const workerUrl = process.env.WORKER_URL ?? 'http://127.0.0.1:4000';
  const secret = process.env.WORKER_SHARED_SECRET ?? '';
  if (!secret) return { reachable: false, interrupted: 0 };
  const batches = jobIds
    ? Array.from({ length: Math.ceil(jobIds.length / 200) }, (_, index) =>
        jobIds.slice(index * 200, (index + 1) * 200),
      )
    : [undefined];
  let interrupted = 0;
  for (const batch of batches) {
    try {
      const response = await fetch(`${workerUrl}/automation/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orgId, jobIds: batch }),
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return { reachable: false, interrupted };
      const payload = (await response.json()) as { cancelled?: string[] };
      interrupted += payload.cancelled?.length ?? 0;
    } catch {
      return { reachable: false, interrupted };
    }
  }
  return { reachable: true, interrupted };
}

export async function cancelJobsForPayloadReferences(input: {
  orgId: string;
  field: 'storeId' | 'competitorProductId' | 'shipmentId';
  values: string[];
}) {
  if (input.values.length === 0) return [];
  const payloadReference = sql<string>`${schema.automationJobs.payloadJson} ->> ${input.field}`;
  const cancelled = await db()
    .update(schema.automationJobs)
    .set({
      status: 'cancelled',
      finishedAt: new Date(),
      errorCode: 'source_deleted',
      errorSummary: 'The source entity was deleted by an operator.',
      leaseOwner: null,
      leaseToken: null,
      leasedUntil: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.automationJobs.orgId, input.orgId),
        inArray(schema.automationJobs.status, [...activeAutomationStatuses]),
        inArray(payloadReference, input.values),
      ),
    )
    .returning({ id: schema.automationJobs.id });
  if (cancelled.length > 0) {
    await interruptLocalWorker(
      input.orgId,
      cancelled.map((job) => job.id),
    );
  }
  return cancelled.map((job) => job.id);
}

export async function cancelJobsForPayloadReference(input: {
  orgId: string;
  field: 'storeId' | 'competitorProductId' | 'shipmentId';
  value: string;
}) {
  return cancelJobsForPayloadReferences({
    orgId: input.orgId,
    field: input.field,
    values: [input.value],
  });
}
