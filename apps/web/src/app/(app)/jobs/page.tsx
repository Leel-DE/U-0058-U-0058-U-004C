import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { ListTodo } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { timeAgo } from '@/lib/utils';
import { QueueControls } from '../automation/_components/job-controls';

export const dynamic = 'force-dynamic';

function statusVariant(status: string) {
  return status === 'succeeded'
    ? ('success' as const)
    : status === 'failed' || status === 'dead_letter'
      ? ('destructive' as const)
      : status === 'awaiting_user' || status === 'partial' || status === 'running'
        ? ('warning' as const)
        : ('secondary' as const);
}

export default async function JobsPage() {
  const ctx = await getContext();
  const [jobs, statusCounts] = await Promise.all([
    db()
      .select()
      .from(schema.automationJobs)
      .where(eq(schema.automationJobs.orgId, ctx.orgId))
      .orderBy(desc(schema.automationJobs.createdAt))
      .limit(200),
    db()
      .select({ status: schema.automationJobs.status, count: sql<number>`count(*)::int` })
      .from(schema.automationJobs)
      .where(eq(schema.automationJobs.orgId, ctx.orgId))
      .groupBy(schema.automationJobs.status),
  ]);
  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, Number(row.count)]));
  const activeCount =
    Number(counts.queued ?? 0) + Number(counts.running ?? 0) + Number(counts.awaiting_user ?? 0);
  const totalCount = Object.values(counts).reduce((sum, count) => sum + Number(count), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary text-base font-medium sm:text-sm">Operations</p>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground text-pretty text-base sm:text-sm">
            Every browser automation task in the shared durable queue.
          </p>
        </div>
        <QueueControls
          activeCount={activeCount}
          totalCount={totalCount}
          canStop={ctx.role !== 'viewer'}
          canDelete={ctx.role === 'owner'}
        />
      </header>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="size-8" />}
          title="No Jobs Yet"
          description="Add a shipment or run a competitor check to create the first job."
        />
      ) : (
        <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
            <table className="w-full min-w-[820px] text-left text-base sm:text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="whitespace-nowrap py-3 pr-4 font-medium">Job</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Priority</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Progress</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Created</th>
                  <th className="whitespace-nowrap py-3 pl-4 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const progress = job.progressJson as { progress?: number } | null;
                  return (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                          {job.type.replaceAll('_', ' ')}
                        </Link>
                        <p className="text-muted-foreground font-mono">{job.id.slice(0, 12)}...</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{job.priority}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {progress?.progress ?? (job.status === 'succeeded' ? 100 : 0)}%
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{timeAgo(job.createdAt)}</td>
                      <td className="py-3 pl-4 tabular-nums">
                        {job.attemptCount}/{job.maxAttempts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
