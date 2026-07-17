import { desc, eq } from 'drizzle-orm';
import { TriangleAlert } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { timeAgo } from '@/lib/utils';
import { ReplayButton } from './replay-button';

export const dynamic = 'force-dynamic';
export default async function DeadLetterPage() {
  const ctx = await getContext();
  const jobs = await db()
    .select()
    .from(schema.automationJobs)
    .where(eq(schema.automationJobs.orgId, ctx.orgId))
    .orderBy(desc(schema.automationJobs.createdAt))
    .limit(200);
  const dead = jobs.filter((job) => job.status === 'dead_letter');
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-sm font-medium">Advanced</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dead letter queue</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Задачи, исчерпавшие безопасный лимит повторов. Повтор доступен только владельцу.
        </p>
      </header>
      {dead.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert className="h-8 w-8" />}
          title="Очередь пуста"
          description="Необработанных задач нет."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Задача</th>
                  <th className="px-4 py-3">Ошибка</th>
                  <th className="px-4 py-3">Попытки</th>
                  <th className="px-4 py-3">Время</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {dead.map((job) => (
                  <tr className="border-b last:border-0" key={job.id}>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{job.type}</Badge>
                      <p className="text-muted-foreground mt-1 font-mono text-xs">{job.id}</p>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="font-medium">{job.errorCode}</p>
                      <p className="text-muted-foreground text-xs">{job.errorSummary}</p>
                    </td>
                    <td className="px-4 py-3">
                      {job.attemptCount}/{job.maxAttempts}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">{timeAgo(job.finishedAt)}</td>
                    <td className="px-4 py-3">
                      {ctx.role === 'owner' ? <ReplayButton jobId={job.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
