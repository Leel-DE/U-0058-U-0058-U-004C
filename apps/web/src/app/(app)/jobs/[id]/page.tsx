import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancelJobControl, DeleteJobControl } from '../../automation/_components/job-controls';

export const dynamic = 'force-dynamic';
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [job] = await db()
    .select()
    .from(schema.automationJobs)
    .where(and(eq(schema.automationJobs.id, id), eq(schema.automationJobs.orgId, ctx.orgId)))
    .limit(1);
  if (!job) notFound();
  const active = ['queued', 'running', 'awaiting_user'].includes(job.status);
  const terminal = ['succeeded', 'partial', 'failed', 'dead_letter', 'cancelled'].includes(
    job.status,
  );
  const events = await db()
    .select()
    .from(schema.automationJobEvents)
    .where(
      and(
        eq(schema.automationJobEvents.jobId, id),
        eq(schema.automationJobEvents.orgId, ctx.orgId),
      ),
    )
    .orderBy(asc(schema.automationJobEvents.createdAt));
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/jobs">
          <ArrowLeft className="h-4 w-4" />
          Все задачи
        </Link>
      </Button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{job.type}</Badge>
            <Badge variant="outline">{job.status}</Badge>
            <Badge variant="outline">{job.priority}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Job {job.id.slice(0, 12)}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Executor {job.executorVersion} · input v{job.inputVersion} · result v{job.resultVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && ctx.role !== 'viewer' ? <CancelJobControl jobId={job.id} /> : null}
          {terminal && ctx.role === 'owner' ? <DeleteJobControl jobId={job.id} /> : null}
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Выполнение</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Событий пока нет.</p>
          ) : (
            <ol className="space-y-4">
              {events.map((event) => (
                <li
                  key={event.id.toString()}
                  className="border-primary/30 grid gap-1 border-l-2 pl-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{event.message}</p>
                    <span className="text-muted-foreground text-xs">{event.progress ?? 0}%</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {event.event} · {event.createdAt.toLocaleString('ru-RU')}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      {job.errorSummary ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Ошибка</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{job.errorCode}</p>
            <p className="text-muted-foreground mt-1 text-sm">{job.errorSummary}</p>
          </CardContent>
        </Card>
      ) : null}
      {job.resultJson ? (
        <details className="bg-card rounded-lg border">
          <summary className="cursor-pointer p-4 font-medium">Нормализованный отчёт</summary>
          <pre className="max-h-[500px] overflow-auto border-t p-4 text-xs">
            {JSON.stringify(job.resultJson, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
