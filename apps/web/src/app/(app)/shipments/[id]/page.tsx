import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  MapPin,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShipmentStatusBadge } from '../_components/status-badge';
import { CheckButton } from '../_components/check-button';
import { ResumeButton } from '../_components/resume-button';
import { TrackingSettingsForm } from '../_components/tracking-settings';
import { ShipmentActions } from '../_components/shipment-actions';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [shipment] = await db()
    .select()
    .from(schema.shipments)
    .where(and(eq(schema.shipments.id, id), eq(schema.shipments.orgId, ctx.orgId)))
    .limit(1);
  if (!shipment) notFound();
  const [events, jobs, providers] = await Promise.all([
    db()
      .select()
      .from(schema.shipmentEvents)
      .where(
        and(eq(schema.shipmentEvents.shipmentId, id), eq(schema.shipmentEvents.orgId, ctx.orgId)),
      )
      .orderBy(desc(schema.shipmentEvents.eventAt))
      .limit(100),
    db()
      .select()
      .from(schema.automationJobs)
      .where(
        and(
          eq(schema.automationJobs.orgId, ctx.orgId),
          eq(schema.automationJobs.dedupeKey, `shipment:${id}`),
        ),
      )
      .orderBy(desc(schema.automationJobs.createdAt))
      .limit(20),
    db()
      .select()
      .from(schema.shipmentProviderResults)
      .where(
        and(
          eq(schema.shipmentProviderResults.shipmentId, id),
          eq(schema.shipmentProviderResults.orgId, ctx.orgId),
        ),
      )
      .orderBy(desc(schema.shipmentProviderResults.createdAt))
      .limit(30),
  ]);
  const latestJob = jobs[0];
  const canManage = ctx.role !== 'viewer';
  const progress = latestJob?.progressJson as { progress?: number; provider?: string } | null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/shipments">
          <ArrowLeft className="h-4 w-4" />
          Все посылки
        </Link>
      </Button>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ShipmentStatusBadge status={shipment.currentStatus} />
            {shipment.trackingEnabled ? (
              <Badge variant="outline">Автопроверка включена</Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {shipment.displayName || 'Посылка'}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">{shipment.trackingNumber}</p>
        </div>
        {canManage ? (
          <div className="flex flex-col items-end gap-2">
            {shipment.trackingEnabled ? <CheckButton shipmentId={shipment.id} /> : null}
            <ShipmentActions
              shipmentId={shipment.id}
              trackingNumber={shipment.trackingNumber}
              trackingEnabled={shipment.trackingEnabled}
              isDelivered={shipment.currentStatus === 'delivered'}
              canDelete={ctx.role === 'owner'}
              redirectAfterDelete
            />
          </div>
        ) : null}
      </header>

      {latestJob && ['queued', 'running', 'awaiting_user'].includes(latestJob.status) ? (
        <Card
          className={
            latestJob.status === 'awaiting_user' ? 'border-warning/50' : 'border-primary/30'
          }
        >
          <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex gap-3">
              {latestJob.status === 'awaiting_user' ? (
                <ShieldAlert className="text-warning mt-0.5 h-5 w-5" />
              ) : (
                <Bot className="text-primary mt-0.5 h-5 w-5" />
              )}
              <div>
                <p className="font-medium">
                  {latestJob.status === 'queued'
                    ? 'Проверка ждёт свободного браузера'
                    : latestJob.status === 'running'
                      ? `Проверка выполняется${progress?.provider ? `: ${progress.provider}` : ''}`
                      : 'Нужно пройти CAPTCHA вручную'}
                </p>
                <p className="text-muted-foreground text-sm">
                  Прогресс: {progress?.progress ?? (latestJob.status === 'queued' ? 0 : 90)}%.
                  Страницу можно закрыть.
                </p>
              </div>
            </div>
            {latestJob.status === 'awaiting_user' && canManage ? (
              <ResumeButton jobId={latestJob.id} />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Текущий результат
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {shipment.statusTitle || 'Статус уточняется'}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
              {shipment.statusDescription || 'Automation Hub ещё не получил подтверждённые данные.'}
            </p>
            {shipment.confidence ? (
              <p className="text-muted-foreground mt-4 text-xs">
                Уверенность результата: {Math.round(Number(shipment.confidence) * 100)}%
              </p>
            ) : null}
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex gap-2">
              <Truck className="text-muted-foreground h-4 w-4" />
              <div>
                <dt className="text-muted-foreground text-xs">Служба</dt>
                <dd>{shipment.lastCarrier ?? shipment.carrierHint ?? 'Автоопределение'}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <MapPin className="text-muted-foreground h-4 w-4" />
              <div>
                <dt className="text-muted-foreground text-xs">Последнее место</dt>
                <dd>{shipment.lastLocation ?? 'Не указано'}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <CalendarClock className="text-muted-foreground h-4 w-4" />
              <div>
                <dt className="text-muted-foreground text-xs">Проверено</dt>
                <dd>{timeAgo(shipment.lastCheckedAt)}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">История движения</h2>
        {events.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-5 text-sm">
              Подтверждённых событий пока нет.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-0">
            {events.map((event, index) => (
              <div key={event.id.toString()} className="grid grid-cols-[24px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <CircleDot className="text-primary h-4 w-4" />
                  {index < events.length - 1 ? <span className="bg-border h-full w-px" /> : null}
                </div>
                <div className="pb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    <ShipmentStatusBadge status={event.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{event.description}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {event.eventAt
                      ? new Date(event.eventAt).toLocaleString('ru-RU')
                      : 'Время не указано'}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="bg-card rounded-lg border">
        <summary className="cursor-pointer list-none p-4 font-medium">
          Технические данные источников{' '}
          <span className="text-muted-foreground text-sm font-normal">({providers.length})</span>
        </summary>
        <div className="border-t p-4">
          {providers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Результатов источников ещё нет.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{provider.provider}</p>
                    <Badge
                      variant={
                        provider.status === 'succeeded'
                          ? 'success'
                          : provider.status === 'captcha'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {provider.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {provider.durationMs ? `${provider.durationMs} ms` : 'Время не указано'} ·{' '}
                    {timeAgo(provider.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Настройки проверки</CardTitle>
          </CardHeader>
          <CardContent>
            <TrackingSettingsForm
              shipmentId={shipment.id}
              initialValue={{
                respectRobotsTxt: shipment.respectRobotsTxt,
                forceJavaScript: shipment.forceJavaScript,
                useAi: shipment.useAi,
                useManualCaptcha: shipment.useManualCaptcha,
                checkIntervalMinutes: shipment.checkIntervalOverrideMinutes,
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Расписание
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">Интервал</p>
            <p>
              {shipment.checkIntervalMinutes} мин.
              {shipment.checkIntervalOverrideMinutes ? ' (фиксированный)' : ' (авто)'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Следующая проверка</p>
            <p>{shipment.nextCheckAt?.toLocaleString('ru-RU') ?? 'Не запланирована'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Режим браузера</p>
            <p>Адаптивный локальный</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
