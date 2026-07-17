'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackagePlus } from 'lucide-react';
import { createShipment } from '@/server/actions/shipments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function ShipmentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(false);
  const [forceJavaScript, setForceJavaScript] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [useManualCaptcha, setUseManualCaptcha] = useState(true);

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
            respectRobotsTxt,
            forceJavaScript,
            useAi,
            useManualCaptcha,
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'trackingNumber-error' : 'trackingNumber-help'}
          required
          placeholder="Например, 1Z0R6D896828244757"
        />
        <p id="trackingNumber-help" className="text-muted-foreground text-xs">
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
      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-1 font-medium">Настройки проверки</legend>
        <p className="text-muted-foreground text-sm">
          Эти параметры сохраняются для посылки и применяются ко всем следующим проверкам.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TrackingToggle
            id="respectRobotsTxt"
            label="Respect robots.txt"
            description="Пропускать источник, если его robots.txt запрещает проверку."
            checked={respectRobotsTxt}
            onCheckedChange={setRespectRobotsTxt}
          />
          <TrackingToggle
            id="forceJavaScript"
            label="Force JavaScript rendering"
            description="Дожидаться динамической загрузки статуса на странице."
            checked={forceJavaScript}
            onCheckedChange={setForceJavaScript}
          />
          <TrackingToggle
            id="useAi"
            label="Use AI result summary"
            description="Использовать AI только для понятного итогового описания."
            checked={useAi}
            onCheckedChange={setUseAi}
          />
          <TrackingToggle
            id="useManualCaptcha"
            label="Use manual captcha mode"
            description="Открывать видимое окно, если автоматическая проверка упёрлась в CAPTCHA."
            checked={useManualCaptcha}
            onCheckedChange={setUseManualCaptcha}
          />
        </div>
      </fieldset>
      {error ? (
        <p
          id="trackingNumber-error"
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

function TrackingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-20 items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
