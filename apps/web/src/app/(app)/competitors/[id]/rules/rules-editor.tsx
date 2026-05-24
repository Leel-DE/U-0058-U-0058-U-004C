'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schemas } from '@cr/shared';
import type { ScrapeResponse } from '@cr/shared';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/form-message';
import { updateScrapingRules } from '@/server/actions/stores';
import { testScrapeUrl } from '@/server/actions/scrape';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

type FormValues = Omit<z.infer<typeof schemas.scrapingRulesSchema>, 'storeId'>;

const SELECTOR_FIELDS: Array<{ key: keyof FormValues; label: string; placeholder?: string }> = [
  { key: 'titleSelector', label: 'Title', placeholder: 'h1.product-title' },
  { key: 'priceSelector', label: 'Price', placeholder: '.price .current' },
  { key: 'oldPriceSelector', label: 'Old price (optional)', placeholder: '.price .was' },
  { key: 'availabilitySelector', label: 'Availability', placeholder: '.stock-status' },
  { key: 'imageSelector', label: 'Image', placeholder: '.product-gallery img' },
  { key: 'shippingSelector', label: 'Shipping (optional)', placeholder: '.shipping-info' },
  { key: 'ratingSelector', label: 'Rating (optional)', placeholder: '.rating-stars' },
];

export function RulesEditor({
  storeId,
  defaultValues,
}: {
  storeId: string;
  defaultValues: FormValues;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [testUrl, setTestUrl] = useState('');
  const [result, setResult] = useState<ScrapeResponse | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      schemas.scrapingRulesSchema.omit({ storeId: true }),
    ),
    defaultValues,
  });

  function save(values: FormValues) {
    startSave(async () => {
      const r = await updateScrapingRules({ storeId, ...values });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Rules saved');
      router.refresh();
    });
  }

  function runTest() {
    if (!testUrl) return;
    startTest(async () => {
      // first, save current rules so the test uses them
      await updateScrapingRules({ storeId, ...form.getValues() });
      const r = await testScrapeUrl({ storeId, url: testUrl });
      if (!r.ok) {
        toast.error(r.error.message);
        setResult(null);
        return;
      }
      setResult(r.data);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-4" onSubmit={form.handleSubmit(save)}>
        <div className="space-y-3 rounded-md border p-3">
          <SwitchRow
            label="Try JSON-LD first"
            description="Most modern shops expose schema.org Product."
            checked={form.watch('useJsonLd')}
            onChange={(v) => form.setValue('useJsonLd', v)}
          />
          <SwitchRow
            label="Try OpenGraph"
            description="Fallback for og:price:amount tags."
            checked={form.watch('useOpenGraph')}
            onChange={(v) => form.setValue('useOpenGraph', v)}
          />
        </div>

        {SELECTOR_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              placeholder={f.placeholder}
              {...form.register(f.key as never)}
            />
            <FormError message={(form.formState.errors as Record<string, { message?: string }>)[f.key]?.message} />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="priceRegex">Price strip regex (optional)</Label>
          <Input id="priceRegex" placeholder="[\d.,]+" {...form.register('priceRegex')} />
          <p className="text-xs text-muted-foreground">
            If your price field contains currency symbols or extra text, use a regex to extract the number.
          </p>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save rules'}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="rounded-md border p-4">
          <Label htmlFor="testUrl">Test on a real URL</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="testUrl"
              placeholder="https://store.example.com/product/abc"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
            />
            <Button type="button" onClick={runTest} disabled={testing || !testUrl}>
              {testing ? 'Testing…' : 'Test'}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We save your current rules, fetch the URL via the worker, and show what we extracted.
          </p>
        </div>

        {result ? (
          result.ok ? (
            <div className="space-y-2 rounded-md border bg-card p-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">Extraction result</div>
                <div className="flex gap-1">
                  <Badge variant="outline">{result.meta.sourcePath}</Badge>
                  <Badge variant="outline">
                    {Math.round(result.meta.confidence * 100)}% confidence
                  </Badge>
                </div>
              </div>
              <Field k="Title" v={result.data.title} />
              <Field
                k="Price"
                v={result.data.price != null ? `${result.data.price} ${result.data.currency ?? ''}` : null}
              />
              <Field
                k="Old price"
                v={result.data.oldPrice != null ? String(result.data.oldPrice) : null}
              />
              <Field k="Availability" v={result.data.availability} />
              <Field k="Image" v={result.data.image} />
              <Field k="Shipping" v={result.data.shipping} />
              <Field k="Rating" v={result.data.rating != null ? String(result.data.rating) : null} />
              <p className="pt-2 text-xs text-muted-foreground">
                HTTP {result.meta.httpStatus} · {result.meta.durationMs} ms · strategy: {result.meta.strategy}
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="font-medium text-destructive">Extraction failed: {result.errorCode}</div>
              <p className="text-muted-foreground">{result.message}</p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 text-xs uppercase text-muted-foreground">{k}</span>
      <span className="flex-1 break-all">
        {v == null || v === '' ? <span className="text-muted-foreground">—</span> : String(v)}
      </span>
    </div>
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
