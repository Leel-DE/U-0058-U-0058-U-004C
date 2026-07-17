'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackagePlus } from 'lucide-react';
import { createShipment } from '@/server/actions/shipments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ShipmentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createShipment({
            trackingNumber: data.get('trackingNumber'),
            displayName: data.get('displayName') || undefined,
            carrierHint: data.get('carrierHint') || undefined,
            originCountry: data.get('originCountry') || undefined,
            destinationCountry: data.get('destinationCountry') || undefined,
          });
          if (!result.ok) {
            setError(result.error.fieldErrors?.trackingNumber?.[0] ?? result.error.message);
            return;
          }
          router.push(`/shipments/${result.data.id}`);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="trackingNumber">Трек-номер</Label>
        <Input
          id="trackingNumber"
          name="trackingNumber"
          autoComplete="off"
          required
          placeholder="Например, 1Z0R6D896828244757"
        />
        <p className="text-muted-foreground text-xs">
          Для поиска используется только трек-номер. Страны и перевозчик — необязательные подсказки
          для отчёта.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="displayName">Название</Label>
        <Input id="displayName" name="displayName" placeholder="Поставка инструментов" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="carrierHint">Перевозчик</Label>
          <Input id="carrierHint" name="carrierHint" placeholder="Auto detect" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="originCountry">Откуда</Label>
          <Input
            id="originCountry"
            name="originCountry"
            maxLength={2}
            placeholder="CN"
            className="uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="destinationCountry">Куда</Label>
          <Input
            id="destinationCountry"
            name="destinationCountry"
            maxLength={2}
            placeholder="DE"
            className="uppercase"
          />
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="h-4 w-4" />
        )}
        Добавить и проверить
      </Button>
    </form>
  );
}
