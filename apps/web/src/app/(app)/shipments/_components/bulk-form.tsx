'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus, Loader2 } from 'lucide-react';
import { bulkCreateShipments } from '@/server/actions/shipments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function BulkShipmentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={5}
        placeholder={'Один трек-номер на строку\n1Z...\nYT...'}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">До 100 номеров. Дубликаты будут пропущены.</p>
        <Button
          disabled={pending || !value.trim()}
          onClick={() =>
            startTransition(async () => {
              const trackingNumbers = value
                .split(/[\n,;]+/)
                .map((item) => item.trim())
                .filter(Boolean);
              const result = await bulkCreateShipments({ trackingNumbers });
              if (result.ok) {
                setMessage(
                  `Добавлено: ${result.data.created}. Дубликатов: ${result.data.duplicates}.`,
                );
                setValue('');
                router.refresh();
              } else setMessage(result.error.message);
            })
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListPlus className="h-4 w-4" />
          )}
          Добавить список
        </Button>
      </div>
      {message ? (
        <p className="text-sm" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
