import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { activeAutomationStatuses } from '@/server/automation/control';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getContext();
  const workerUrl = process.env.WORKER_URL ?? 'http://127.0.0.1:4000';
  const secret = process.env.WORKER_SHARED_SECRET ?? '';
  const incomingUrl = new URL(request.url);
  const after = incomingUrl.searchParams.get('after');
  const query = new URLSearchParams({ limit: '100', orgId: ctx.orgId });
  if (after) query.set('after', after);

  const [queueJobs, statusCounts, settingsRows, nextRunRows] = await Promise.all([
    db()
      .select({
        id: schema.automationJobs.id,
        type: schema.automationJobs.type,
        status: schema.automationJobs.status,
        priority: schema.automationJobs.priority,
        progressJson: schema.automationJobs.progressJson,
        scheduledAt: schema.automationJobs.scheduledAt,
        startedAt: schema.automationJobs.startedAt,
        createdAt: schema.automationJobs.createdAt,
        attemptCount: schema.automationJobs.attemptCount,
        maxAttempts: schema.automationJobs.maxAttempts,
      })
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.orgId, ctx.orgId),
          inArray(schema.automationJobs.status, [...activeAutomationStatuses]),
        ),
      )
      .orderBy(asc(schema.automationJobs.scheduledAt))
      .limit(25),
    db()
      .select({
        status: schema.automationJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.automationJobs)
      .where(eq(schema.automationJobs.orgId, ctx.orgId))
      .groupBy(schema.automationJobs.status),
    db()
      .select()
      .from(schema.automationSettings)
      .where(eq(schema.automationSettings.orgId, ctx.orgId))
      .limit(1),
    db()
      .select({ nextRunAt: sql<Date | null>`min(${schema.competitorProducts.nextRunAt})` })
      .from(schema.competitorProducts)
      .where(
        and(
          eq(schema.competitorProducts.orgId, ctx.orgId),
          eq(schema.competitorProducts.active, true),
        ),
      ),
  ]);
  const automationPolicy = {
    enabled: settingsRows[0]?.enabled ?? true,
    competitorIntervalMinutes: settingsRows[0]?.competitorIntervalMinutes ?? 1440,
    maxConcurrentJobs: settingsRows[0]?.maxConcurrentJobs ?? 1,
    nextCompetitorRunAt: nextRunRows[0]?.nextRunAt ?? null,
  };
  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, Number(row.count)]));
  const queue = {
    jobs: queueJobs.map((job) => ({
      ...job,
      progress: (job.progressJson as { progress?: number } | null)?.progress ?? 0,
    })),
    counts,
    activeCount:
      Number(counts.queued ?? 0) + Number(counts.running ?? 0) + Number(counts.awaiting_user ?? 0),
    totalCount: Object.values(counts).reduce((sum, value) => sum + Number(value), 0),
  };

  try {
    const [statusResponse, eventsResponse] = await Promise.all([
      fetch(`${workerUrl}/automation/status`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      }),
      fetch(`${workerUrl}/automation/events?${query}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      }),
    ]);
    if (!statusResponse.ok || !eventsResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Automation worker is unavailable. Queue data is still current.',
          queue,
          automationPolicy,
          webProcess: {
            pid: process.pid,
            uptimeSeconds: Math.floor(process.uptime()),
            memoryRssBytes: process.memoryUsage().rss,
          },
        },
        { status: 503 },
      );
    }
    const status = (await statusResponse.json()) as {
      automationHub: {
        activeJobs: string[];
        activeJobDetails?: Array<{ id: string; orgId: string }>;
        [key: string]: unknown;
      };
    };
    const events = await eventsResponse.json();
    const activeJobDetails = (status.automationHub.activeJobDetails ?? []).filter(
      (job) => job.orgId === ctx.orgId,
    );
    return NextResponse.json({
      ok: true,
      automationHub: {
        ...status.automationHub,
        activeJobs: activeJobDetails.map((job) => job.id),
        activeJobDetails,
      },
      events: events.events,
      queue,
      automationPolicy,
      webProcess: {
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: process.memoryUsage().rss,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Automation worker is unavailable. Queue data is still current.',
        queue,
        automationPolicy,
        webProcess: {
          pid: process.pid,
          uptimeSeconds: Math.floor(process.uptime()),
          memoryRssBytes: process.memoryUsage().rss,
        },
      },
      { status: 503 },
    );
  }
}
