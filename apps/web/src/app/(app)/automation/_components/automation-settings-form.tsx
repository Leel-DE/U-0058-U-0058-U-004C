'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';
import type { Result } from '@cr/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateAutomationSettings } from '@/server/actions/automation';

interface AutomationSettingsValue {
  enabled: boolean;
  competitorIntervalMinutes: number;
  maxConcurrentJobs: number;
}

const scheduleOptions = [
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Every day' },
  { value: 4320, label: 'Every 3 days' },
  { value: 10080, label: 'Every week' },
];

function actionData<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.message ?? 'Settings could not be saved.');
  return result.data;
}

export function AutomationSettingsForm({
  initialValue,
  canManage,
}: {
  initialValue: AutomationSettingsValue;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const data = actionData(await updateAutomationSettings(value));
        setValue({
          enabled: data.settings.enabled,
          competitorIntervalMinutes: data.settings.competitorIntervalMinutes,
          maxConcurrentJobs: data.settings.maxConcurrentJobs,
        });
        toast(
          data.settings.enabled
            ? 'Automation schedule updated'
            : `${data.cancelled} active jobs stopped and automation paused`,
        );
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Settings could not be saved.');
      }
    });
  }

  return (
    <section aria-labelledby="automation-policy-title" className="space-y-4 border-y py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="automation-policy-title" className="font-semibold">
              Automation Settings
            </h2>
            <Badge variant={value.enabled ? 'success' : 'secondary'}>
              {value.enabled ? 'Running' : 'Paused'}
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-[70ch] text-pretty text-base sm:text-sm">
            These settings belong to the selected organization. Switching accounts does not change
            work already configured for another organization.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className={isPending ? 'pr-3 pl-2' : undefined}
            onClick={save}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : null}
            Save Settings
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <fieldset className="space-y-2" disabled={!canManage || isPending}>
          <legend className="font-medium">Automatic Runs</legend>
          <p className="text-muted-foreground text-pretty text-base sm:text-sm">
            Pausing stops the active queue and prevents new jobs from running until you resume.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { enabled: true, label: 'Running' },
              { enabled: false, label: 'Paused' },
            ].map((option) => (
              <Label
                key={String(option.enabled)}
                className="has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 has-focus-visible:ring-2 sm:min-h-10"
              >
                <input
                  type="radio"
                  name="automationEnabled"
                  value={String(option.enabled)}
                  checked={value.enabled === option.enabled}
                  onChange={() => setValue((current) => ({ ...current, enabled: option.enabled }))}
                  className="size-5 accent-current sm:size-4"
                />
                {option.label}
              </Label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="competitorInterval">Competitor Schedule</Label>
          <p className="text-muted-foreground text-pretty text-base sm:text-sm">
            Applies one interval to every active competitor site in this organization.
          </p>
          <Select
            value={String(value.competitorIntervalMinutes)}
            onValueChange={(next) =>
              setValue((current) => ({
                ...current,
                competitorIntervalMinutes: Number(next),
              }))
            }
            disabled={!canManage || isPending}
          >
            <SelectTrigger id="competitorInterval" aria-label="Competitor schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scheduleOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-2" disabled={!canManage || isPending}>
          <legend className="font-medium">Parallel Browser Workers</legend>
          <p className="text-muted-foreground text-pretty text-base sm:text-sm">
            Higher values finish the queue faster but use more memory and CPU.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((count) => (
              <Label
                key={count}
                className="has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-3 py-2 tabular-nums has-focus-visible:ring-2 sm:min-h-10"
              >
                <input
                  type="radio"
                  name="maxConcurrentJobs"
                  value={count}
                  checked={value.maxConcurrentJobs === count}
                  onChange={() => setValue((current) => ({ ...current, maxConcurrentJobs: count }))}
                  className="sr-only"
                />
                {count}
              </Label>
            ))}
          </div>
        </fieldset>
      </div>

      {error ? (
        <p className="text-destructive text-pretty text-base sm:text-sm" role="alert">
          {error} Check the values and try again.
        </p>
      ) : null}
    </section>
  );
}
