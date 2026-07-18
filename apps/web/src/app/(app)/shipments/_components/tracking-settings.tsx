'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { updateShipmentTrackingSettings } from '@/server/actions/shipments';

interface TrackingSettings {
  respectRobotsTxt: boolean;
  forceJavaScript: boolean;
  useAi: boolean;
  useManualCaptcha: boolean;
  /** Fixed interval in minutes; null = adaptive (from status). */
  checkIntervalMinutes: number | null;
}

const INTERVAL_OPTIONS = [
  { value: 'auto', label: 'Автоматически (по статусу)' },
  { value: '30', label: 'Каждые 30 минут' },
  { value: '60', label: 'Каждый час' },
  { value: '180', label: 'Каждые 3 часа' },
  { value: '360', label: 'Каждые 6 часов' },
  { value: '720', label: 'Каждые 12 часов' },
  { value: '1440', label: 'Раз в сутки' },
] as const;

export function TrackingSettingsForm({
  shipmentId,
  initialValue,
}: {
  shipmentId: string;
  initialValue: TrackingSettings;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(key: keyof TrackingSettings, checked: boolean) {
    setValue((current) => ({ ...current, [key]: checked }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <Label htmlFor="shipmentCheckInterval">Частота проверки</Label>
        <p className="text-muted-foreground mt-1 text-xs">
          «Автоматически» подстраивает интервал под статус (в пути — каждые 3 часа, на таможне —
          каждый час). Фиксированное значение применяется сразу.
        </p>
        <Select
          value={value.checkIntervalMinutes ? String(value.checkIntervalMinutes) : 'auto'}
          onValueChange={(selected) =>
            setValue((current) => ({
              ...current,
              checkIntervalMinutes: selected === 'auto' ? null : Number(selected),
            }))
          }
          disabled={pending}
        >
          <SelectTrigger id="shipmentCheckInterval" className="mt-2 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVAL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Setting
          id="shipmentRespectRobots"
          label="Respect robots.txt"
          description="Пропускать источник, если его robots.txt запрещает проверку."
          checked={value.respectRobotsTxt}
          onCheckedChange={(checked) => change('respectRobotsTxt', checked)}
          disabled={pending}
        />
        <Setting
          id="shipmentForceJavaScript"
          label="Force JavaScript rendering"
          description="Дожидаться динамической загрузки статуса на странице."
          checked={value.forceJavaScript}
          onCheckedChange={(checked) => change('forceJavaScript', checked)}
          disabled={pending}
        />
        <Setting
          id="shipmentUseAi"
          label="Use AI result summary"
          description="AI улучшает описание, но не меняет определённый системой статус."
          checked={value.useAi}
          onCheckedChange={(checked) => change('useAi', checked)}
          disabled={pending}
        />
        <Setting
          id="shipmentUseManualCaptcha"
          label="Use manual captcha mode"
          description="Открывать видимое окно и ждать вашего подтверждения при CAPTCHA."
          checked={value.useManualCaptcha}
          onCheckedChange={(checked) => change('useManualCaptcha', checked)}
          disabled={pending}
        />
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateShipmentTrackingSettings({ shipmentId, ...value });
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            toast.success('Настройки отслеживания сохранены');
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Сохранить настройки
      </Button>
    </div>
  );
}

function Setting({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-h-20 items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
