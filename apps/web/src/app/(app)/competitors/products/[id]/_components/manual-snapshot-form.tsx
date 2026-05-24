'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas, SUPPORTED_CURRENCIES, AVAILABILITY } from '@cr/shared';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { FormError } from '@/components/form-message';
import { manualSnapshot } from '@/server/actions/snapshots';

type FormValues = z.infer<typeof schemas.manualSnapshotSchema>;

export function ManualSnapshotForm({
  competitorProductId,
  defaultCurrency,
}: {
  competitorProductId: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.manualSnapshotSchema),
    defaultValues: {
      competitorProductId,
      currency: (defaultCurrency || 'EUR') as FormValues['currency'],
      availability: 'in_stock',
    } as never,
  });

  function onSubmit(values: FormValues) {
    start(async () => {
      const r = await manualSnapshot(values);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(r.data.changed ? 'Snapshot saved' : 'No change since last entry');
      form.setValue('price', undefined as never);
      router.refresh();
    });
  }

  return (
    <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={form.handleSubmit(onSubmit)}>
      <input type="hidden" {...form.register('competitorProductId')} />
      <div className="space-y-1.5">
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          {...form.register('price', { valueAsNumber: true })}
        />
        <FormError message={form.formState.errors.price?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="oldPrice">Old price</Label>
        <Input
          id="oldPrice"
          type="number"
          step="0.01"
          {...form.register('oldPrice', { valueAsNumber: true })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v as never)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Availability</Label>
        <Select
          value={form.watch('availability')}
          onValueChange={(v) => form.setValue('availability', v as never)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {AVAILABILITY.map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save snapshot'}
        </Button>
      </div>
    </form>
  );
}
