import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { Box, ListPlus, PackageCheck, Plus, TriangleAlert } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { getContext } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ShipmentStatusBadge } from './_components/status-badge';
import { ShipmentActions } from './_components/shipment-actions';
import { BulkShipmentForm } from './_components/bulk-form';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ShipmentsPage() {
  const ctx = await getContext();
  const [shipments, counts] = await Promise.all([
    db()
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.orgId, ctx.orgId))
      .orderBy(desc(schema.shipments.updatedAt))
      .limit(200),
    db()
      .select({ status: schema.shipments.currentStatus, count: sql<number>`count(*)::int` })
      .from(schema.shipments)
      .where(eq(schema.shipments.orgId, ctx.orgId))
      .groupBy(schema.shipments.currentStatus),
  ]);
  const byStatus = Object.fromEntries(counts.map((item) => [item.status, item.count]));
  const canManage = ctx.role !== 'viewer';
  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-primary text-sm font-medium">Automation Hub</p>
          <h1 className="text-2xl font-semibold tracking-tight">Посылки</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Единый статус на основе публичных страниц перевозчиков.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/shipments/new">
              <Plus className="h-4 w-4" />
              Добавить посылку
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Box className="text-primary h-5 w-5" />
            <div>
              <p className="text-2xl font-semibold">{shipments.length}</p>
              <p className="text-muted-foreground text-xs">Всего отправлений</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PackageCheck className="text-success h-5 w-5" />
            <div>
              <p className="text-2xl font-semibold">{byStatus.delivered ?? 0}</p>
              <p className="text-muted-foreground text-xs">Доставлено</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TriangleAlert className="text-warning h-5 w-5" />
            <div>
              <p className="text-2xl font-semibold">
                {(byStatus.exception ?? 0) + (byStatus.unknown ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">Требуют внимания</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {shipments.length === 0 ? (
        <EmptyState
          icon={<Box className="h-8 w-8" />}
          title="Посылок пока нет"
          description="Добавьте трек-номер — первая проверка автоматически попадёт в очередь."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/shipments/new">Добавить посылку</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Отправление</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Перевозчик</th>
                  <th className="px-4 py-3">Последняя проверка</th>
                  <th className="px-4 py-3">Следующая</th>
                  {canManage ? <th className="px-4 py-3 text-right">Действия</th> : null}
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-muted/30 border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/shipments/${shipment.id}`}
                        className="font-medium hover:underline"
                      >
                        {shipment.displayName || shipment.trackingNumber}
                      </Link>
                      {shipment.displayName ? (
                        <p className="text-muted-foreground font-mono text-xs">
                          {shipment.trackingNumber}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <ShipmentStatusBadge status={shipment.currentStatus} />
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {shipment.lastCarrier ?? shipment.carrierHint ?? 'Автоопределение'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {timeAgo(shipment.lastCheckedAt)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {shipment.trackingEnabled ? timeAgo(shipment.nextCheckAt) : 'Завершено'}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <ShipmentActions
                          shipmentId={shipment.id}
                          trackingNumber={shipment.trackingNumber}
                          trackingEnabled={shipment.trackingEnabled}
                          isDelivered={shipment.currentStatus === 'delivered'}
                          canDelete={ctx.role === 'owner'}
                          compact
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListPlus className="h-4 w-4" />
              Массовое добавление
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BulkShipmentForm />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
