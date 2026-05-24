'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas } from '@cr/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-message';
import { createCompetitorProduct } from '@/server/actions/products';

type FormValues = z.infer<typeof schemas.createCompetitorProductSchema>;

export function AddCompetitorProductForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.createCompetitorProductSchema),
    defaultValues: { storeId, url: '' },
  });

  function onSubmit(values: FormValues) {
    start(async () => {
      const r = await createCompetitorProduct(values);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Product queued for scraping');
      router.replace(`/competitors/${storeId}`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <input type="hidden" {...form.register('storeId')} />
      <div className="space-y-1.5">
        <Label htmlFor="url">Product URL</Label>
        <Input id="url" placeholder="https://store.example.com/product/abc" {...form.register('url')} />
        <FormError message={form.formState.errors.url?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="externalId">External ID (optional)</Label>
        <Input id="externalId" {...form.register('externalId')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="initialTitle">Initial title (optional)</Label>
        <Input id="initialTitle" {...form.register('initialTitle')} />
        <p className="text-xs text-muted-foreground">
          The scraper will overwrite this on the first successful run.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add product'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
