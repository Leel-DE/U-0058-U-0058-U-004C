'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas, SUPPORTED_CURRENCIES } from '@cr/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { FormError } from '@/components/form-message';
import { createMyProduct } from '@/server/actions/products';

type FormValues = z.infer<typeof schemas.createMyProductSchema>;

export function MyProductForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.createMyProductSchema),
    defaultValues: { currency: 'EUR' } as never,
  });

  function onSubmit(values: FormValues) {
    start(async () => {
      const r = await createMyProduct(values);
      if (!r.ok) {
        if (r.error.fieldErrors) {
          for (const [k, v] of Object.entries(r.error.fieldErrors)) {
            form.setError(k as keyof FormValues, { message: v?.[0] });
          }
        } else {
          form.setError('root', { message: r.error.message });
        }
        return;
      }
      toast.success('Product added');
      router.replace('/products');
      router.refresh();
    });
  }

  return (
    <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" {...form.register('sku')} />
        <FormError message={form.formState.errors.sku?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gtin">GTIN / EAN (optional)</Label>
        <Input id="gtin" {...form.register('gtin')} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...form.register('name')} />
        <FormError message={form.formState.errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="brand">Brand</Label>
        <Input id="brand" {...form.register('brand')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="myPrice">Your price</Label>
        <Input
          id="myPrice"
          type="number"
          step="0.01"
          {...form.register('myPrice', { valueAsNumber: true })}
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
        <Label htmlFor="url">Your product URL (optional)</Label>
        <Input id="url" placeholder="https://yourshop.com/products/sku-123" {...form.register('url')} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={2} {...form.register('notes')} />
      </div>
      <FormError className="md:col-span-2" message={form.formState.errors.root?.message} />
      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add product'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
