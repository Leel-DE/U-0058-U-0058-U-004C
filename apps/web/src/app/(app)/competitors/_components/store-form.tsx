'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { schemas, SUPPORTED_CURRENCIES } from '@cr/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/form-message';
import { createStore, updateStore } from '@/server/actions/stores';
import { BaseSelectorDetectionForm } from './base-selector-detection';

type FormValues = z.infer<typeof schemas.createStoreSchema>;

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: Partial<FormValues> & { id?: string };
}

const COUNTRIES = ['DE', 'GB', 'FR', 'ES', 'IT', 'NL', 'PL', 'US'];

export function StoreForm({ mode, defaultValues }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [homepageUrl, setHomepageUrl] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [categoryUrl, setCategoryUrl] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schemas.createStoreSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      domain: defaultValues?.domain ?? '',
      countryCode: defaultValues?.countryCode ?? 'DE',
      currency: defaultValues?.currency ?? 'EUR',
      crawlFrequencyMinutes: defaultValues?.crawlFrequencyMinutes ?? 1440,
      crawlDelaySeconds: defaultValues?.crawlDelaySeconds ?? 5,
      respectRobots: defaultValues?.respectRobots ?? true,
      jsRequired: defaultValues?.jsRequired ?? false,
      notes: defaultValues?.notes ?? '',
    },
  });

  function applyHomepage(value: string) {
    setHomepageUrl(value);
    try {
      const host = new URL(value).hostname.toLowerCase();
      if (host && !form.getValues('domain')) {
        form.setValue('domain', host, { shouldDirty: true });
      }
    } catch {
      // keep typing tolerant until the value is a full URL
    }
  }

  function onSubmit(values: FormValues) {
    setSetupError(null);
    if (mode === 'create' && !homepageUrl.trim()) {
      setSetupError('Homepage URL is required for selector detection.');
      return;
    }
    let homepageHost: string | null = null;
    if (mode === 'create') {
      try {
        homepageHost = new URL(homepageUrl).hostname.toLowerCase();
      } catch {
        setSetupError('Homepage URL must be a valid URL.');
        return;
      }
    }
    start(async () => {
      const payload =
        mode === 'create' && homepageHost
          ? { ...values, domain: homepageHost }
          : values;
      const r =
        mode === 'create'
          ? await createStore(payload)
          : await updateStore({ id: defaultValues!.id!, ...payload });
      if (!r.ok) {
        for (const [k, v] of Object.entries(r.error.fieldErrors ?? {})) {
          form.setError(k as keyof FormValues, { message: v?.[0] });
        }
        if (!r.error.fieldErrors) form.setError('root', { message: r.error.message });
        return;
      }
      toast.success(mode === 'create' ? 'Competitor added' : 'Saved');
      if (mode === 'create' && 'id' in r.data) {
        setCreatedStoreId(r.data.id);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  if (mode === 'create' && createdStoreId) {
    return (
      <BaseSelectorDetectionForm
        storeId={createdStoreId}
        homepageUrl={homepageUrl}
        productUrl={productUrl || undefined}
        categoryUrl={categoryUrl || undefined}
        useAi={useAi}
        onSaved={() => {
          router.replace(`/competitors/${createdStoreId}/rules`);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      {mode === 'create' ? (
        <div className="space-y-4 rounded-md border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="homepageUrl">Homepage URL</Label>
              <Input
                id="homepageUrl"
                type="url"
                placeholder="https://shop.example.com"
                value={homepageUrl}
                onChange={(event) => applyHomepage(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="productUrl">Product URL</Label>
              <Input
                id="productUrl"
                type="url"
                placeholder="https://shop.example.com/product/example"
                value={productUrl}
                onChange={(event) => setProductUrl(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryUrl">Category URL</Label>
              <Input
                id="categoryUrl"
                type="url"
                placeholder="https://shop.example.com/category/example"
                value={categoryUrl}
                onChange={(event) => setCategoryUrl(event.target.value)}
              />
            </div>
          </div>
          <SwitchRow
            label="Use AI fallback"
            description="Gemini is used only when local heuristics are not confident enough."
            checked={useAi}
            onChange={setUseAi}
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...form.register('name')} />
          <FormError message={form.formState.errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="domain">Domain</Label>
          <Input id="domain" placeholder="shop.example.com" {...form.register('domain')} />
          <FormError message={form.formState.errors.domain?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Select value={form.watch('countryCode')} onValueChange={(v) => form.setValue('countryCode', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v as FormValues['currency'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crawlFrequencyMinutes">Crawl frequency (minutes)</Label>
          <Input
            id="crawlFrequencyMinutes"
            type="number"
            {...form.register('crawlFrequencyMinutes', { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crawlDelaySeconds">Per-request delay (seconds)</Label>
          <Input
            id="crawlDelaySeconds"
            type="number"
            {...form.register('crawlDelaySeconds', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <SwitchRow
          label="Respect robots.txt"
          description="Strongly recommended. Required for ethical scraping mode."
          checked={form.watch('respectRobots')}
          onChange={(v) => form.setValue('respectRobots', v)}
        />
        <SwitchRow
          label="JS-heavy site"
          description="Use headless browser (slower, costlier). Try Cheerio first."
          checked={form.watch('jsRequired')}
          onChange={(v) => form.setValue('jsRequired', v)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} {...form.register('notes')} />
      </div>

      <FormError message={form.formState.errors.root?.message} />
      <FormError message={setupError} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : mode === 'create' ? 'Create and detect selectors' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
