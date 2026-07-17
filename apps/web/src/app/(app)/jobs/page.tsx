import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { ListTodo } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function statusVariant(status: string) {
  return status === 'succeeded'
    ? ('success' as const)
    : status === 'failed' || status === 'dead_letter'
      ? ('destructive' as const)
      : status === 'awaiting_user' || status === 'partial'
        ? ('warning' as const)
        : ('secondary' as const);
}

export default async function JobsPage() {
  const ctx = await getContext();
  const jobs = await db()
    .select()
    .from(schema.automationJobs)
    .where(eq(schema.automationJobs.orgId, ctx.orgId))
    .orderBy(desc(schema.automationJobs.createdAt))
    .limit(200);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-sm font-medium">Operations</p>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Все browser automation задачи в общей очереди.
        </p>
      </header>
      {jobs.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-8 w-8" />}
          title="Задач пока нет"
          description="Добавьте посылку или запустите проверку конкурента."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Задача</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Приоритет</th>
                  <th className="px-4 py-3">Прогресс</th>
                  <th className="px-4 py-3">Создана</th>
                  <th className="px-4 py-3">Попытки</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const progress = job.progressJson as { progress?: number } | null;
                  return (
                    <tr key={job.id} className="hover:bg-muted/30 border-b last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                          {job.type.replaceAll('_', ' ')}
                        </Link>
                        <p className="text-muted-foreground font-mono text-xs">
                          {job.id.slice(0, 12)}…
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{job.priority}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {progress?.progress ?? (job.status === 'succeeded' ? 100 : 0)}%
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{timeAgo(job.createdAt)}</td>
                      <td className="px-4 py-3">
                        {job.attemptCount}/{job.maxAttempts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
