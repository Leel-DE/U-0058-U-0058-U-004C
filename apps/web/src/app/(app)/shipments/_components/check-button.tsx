'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enqueueShipmentCheck } from '@/server/actions/shipments';

export function CheckButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={() =>
          startTransition(async () => {
            const result = await enqueueShipmentCheck({ shipmentId });
            setMessage(
              result.ok
                ? result.data.alreadyQueued
                  ? 'Проверка уже в очереди'
                  : 'Проверка добавлена в очередь'
                : result.error.message,
            );
            router.refresh();
          })
        }
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Проверить сейчас
      </Button>
      {message ? (
        <span className="text-muted-foreground text-xs" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}
