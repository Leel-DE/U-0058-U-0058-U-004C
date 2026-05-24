'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas, ALERT_TYPES, NOTIF_CHANNELS } from '@cr/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormError } from '@/components/form-message';
import { createAlertRule } from '@/server/actions/alerts';

type FormValues = z.infer<typeof schemas.createAlertRuleSchema>;

const TYPE_LABELS: Record<(typeof ALERT_TYPES)[number], string> = {
  competitor_cheaper_than_me: 'Competitor cheaper than me',
  price_drop_pct: 'Price dropped by X%',
  price_rise_pct: 'Price rose by X%',
  back_in_stock: 'Back in stock',
  out_of_stock: 'Out of stock',
  my_price_above_market_pct: 'My price > market by X%',
};

const NEEDS_THRESHOLD: (typeof ALERT_TYPES)[number][] = [
  'price_drop_pct',
  'price_rise_pct',
  'my_price_above_market_pct',
];

interface Props {
  stores: { id: string; name: string }[];
  myProducts: { id: string; name: string }[];
}

export function AlertRuleForm({ stores, myProducts }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.createAlertRuleSchema),
    defaultValues: {
      name: '',
      type: 'price_drop_pct',
      params: { thresholdPct: 10 },
      scope: {},
      channels: ['in_app'],
      active: true,
    } as never,
  });

  const type = form.watch('type');
  const channels = form.watch('channels');
  const needsThreshold = NEEDS_THRESHOLD.includes(type);

  function toggleChannel(c: (typeof NOTIF_CHANNELS)[number]) {
    const current = channels || [];
    const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
    form.setValue('channels', next as never);
  }

  function onSubmit(values: FormValues) {
    start(async () => {
      const r = await createAlertRule(values);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Alert rule created');
      router.replace('/alerts');
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Rule name</Label>
        <Input id="name" {...form.register('name')} />
        <FormError message={form.formState.errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => form.setValue('type', v as never)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALERT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsThreshold ? (
        <div className="space-y-1.5">
          <Label htmlFor="thresholdPct">Threshold (%)</Label>
          <Input
            id="thresholdPct"
            type="number"
            min={0}
            max={100}
            step={0.5}
            {...form.register('params.thresholdPct', { valueAsNumber: true })}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Limit to my product (optional)</Label>
          <Select
            value={form.watch('scope.myProductId') ?? '_'}
            onValueChange={(v) =>
              form.setValue('scope.myProductId', v === '_' ? undefined : v)
            }
          >
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Any</SelectItem>
              {myProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Limit to store (optional)</Label>
          <Select
            value={form.watch('scope.storeId') ?? '_'}
            onValueChange={(v) =>
              form.setValue('scope.storeId', v === '_' ? undefined : v)
            }
          >
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Any</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <Label>Channels</Label>
        {NOTIF_CHANNELS.filter((c) => c !== 'webhook').map((c) => (
          <div key={c} className="flex items-center justify-between">
            <span className="text-sm">{c === 'in_app' ? 'In-app' : 'Email'}</span>
            <Switch
              checked={(channels ?? []).includes(c)}
              onCheckedChange={() => toggleChannel(c)}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Webhook channel will be added in a future release.</p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Create rule'}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
