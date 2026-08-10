'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteShipment, markShipmentDelivered } from '@/server/actions/shipments';

export function ShipmentActions({
  shipmentId,
  trackingNumber,
  trackingEnabled,
  isDelivered,
  canDelete,
  redirectAfterDelete = false,
  compact = false,
}: {
  shipmentId: string;
  trackingNumber: string;
  trackingEnabled: boolean;
  isDelivered: boolean;
  canDelete: boolean;
  redirectAfterDelete?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const canMarkDelivered = trackingEnabled || !isDelivered;

  if (!canMarkDelivered && !canDelete) return null;

  return (
    <div
      className={compact ? 'flex items-center justify-end gap-2' : 'flex flex-col items-end gap-2'}
    >
      <div className="flex flex-wrap justify-end gap-2">
        {canMarkDelivered ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            title="Отметить доставленным и прекратить отслеживание"
            onClick={() => {
              if (
                !window.confirm(
                  `Отметить ${trackingNumber} как доставленную и остановить отслеживание?`,
                )
              ) {
                return;
              }
              startTransition(async () => {
                setMessage(null);
                const result = await markShipmentDelivered({ shipmentId });
                if (!result.ok) {
                  setMessage(result.error.message);
                  return;
                }
                setMessage('Отправление отмечено доставленным');
                router.refresh();
              });
            }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {compact ? 'Доставлено' : 'Отметить доставленным'}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="destructive"
            size={compact ? 'icon' : 'sm'}
            className={compact ? 'h-9 w-9' : undefined}
            disabled={pending}
            title="Удалить отправление и историю проверок"
            aria-label={`Удалить отправление ${trackingNumber}`}
            onClick={() => {
              if (
                !window.confirm(
                  `Удалить ${trackingNumber} вместе с историей проверок? Это действие нельзя отменить.`,
                )
              ) {
                return;
              }
              startTransition(async () => {
                setMessage(null);
                const result = await deleteShipment({ shipmentId });
                if (!result.ok) {
                  setMessage(result.error.message);
                  return;
                }
                if (redirectAfterDelete) router.push('/shipments');
                router.refresh();
              });
            }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {compact ? null : 'Удалить'}
          </Button>
        ) : null}
      </div>
      {!compact && message ? (
        <span className="text-muted-foreground max-w-sm text-right text-xs" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}
