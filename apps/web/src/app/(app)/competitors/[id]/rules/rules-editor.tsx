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
import { autoDetectScrapeUrl, continueManualBrowser, startManualBrowser, testScrapeUrl } from '@/server/actions/scrape';
import { ManualSessionPanel } from './manual-session-panel';
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
  const [detecting, startDetect] = useTransition();
  const [manualPending, startManual] = useTransition();
  const [testUrl, setTestUrl] = useState('');
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [autoDetectResult, setAutoDetectResult] = useState<Record<string, unknown> | null>(null);
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);

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
      if (!r.data.ok && (r.data.errorCode === 'captcha' || r.data.errorCode === 'blocked' || r.data.errorCode === 'suspicious')) {
        toast.message('Opening a manual browser session for this page.');
        runManualCheck();
      }
    });
  }

  function applyProductSuggestion(suggestion: Record<string, unknown>) {
    for (const field of SELECTOR_FIELDS) {
      const value = suggestion[field.key];
      if (typeof value === 'string') {
        form.setValue(field.key as never, value as never, { shouldDirty: true });
      }
    }
  }

  function runAutoDetect(pageType: 'product' | 'category') {
    if (!testUrl) return;
    startDetect(async () => {
      const r = await autoDetectScrapeUrl({ storeId, url: testUrl, pageType });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setAutoDetectResult(r.data);
      const data = r.data as { ok?: boolean; suggestion?: Record<string, unknown>; validation?: { ok?: boolean }; message?: string };
      if (!data.ok) {
        const errorCode = (r.data as { errorCode?: string }).errorCode;
        if (errorCode === 'captcha' || errorCode === 'blocked' || errorCode === 'suspicious') {
          toast.message('Opening a manual browser session for this page.');
          runManualCheck();
        } else {
          toast.error(data.message ?? 'Auto-detect failed');
        }
        return;
      }
      if (pageType === 'product' && data.suggestion) {
        applyProductSuggestion(data.suggestion);
      }
      toast.success(data.validation?.ok ? 'Selectors detected and validated' : 'Selectors detected; review before saving');
    });
  }

  function runManualCheck() {
    if (!testUrl) return;
    startManual(async () => {
      setResult(null);
      await updateScrapingRules({ storeId, ...form.getValues() });
      const r = await startManualBrowser({ storeId, url: testUrl });
      if (!r.ok) {
        toast.error(r.error.message);
        setAutoDetectResult({
          ok: false,
          mode: 'manual',
          message: `Manual browser did not start: ${r.error.message}`,
        });
        return;
      }
      const data = r.data as { session?: { id?: string }; paused?: boolean; preview?: unknown; message?: string };
      if (data.session?.id) {
        setManualSessionId(data.session.id);
        setAutoDetectResult(r.data);
        if (data.paused) {
          toast.message(data.message ?? 'Manual check paused. Complete the challenge in the browser window.');
        } else if (data.preview) {
          toast.success('Manual browser extraction completed');
        } else {
          toast.message('Manual browser opened. Review the page, then continue.');
        }
      } else {
        setAutoDetectResult({
          ...(r.data as Record<string, unknown>),
          mode: 'manual',
          message: data.message ?? 'Manual browser did not return a session id.',
        });
        toast.error(data.message ?? 'Manual browser did not return a session id');
      }
    });
  }

  function continueManual() {
    if (!manualSessionId) return;
    startManual(async () => {
      await updateScrapingRules({ storeId, ...form.getValues() });
      const r = await continueManualBrowser({ storeId, sessionId: manualSessionId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setAutoDetectResult(r.data);
      const data = r.data as { paused?: boolean; preview?: unknown; message?: string };
      if (data.paused) {
        toast.message(data.message ?? 'Still waiting for manual action in the browser window.');
      } else if (data.preview) {
        toast.success('Manual browser extraction completed');
      } else {
        toast.message('Manual session continued; review selectors if extraction is empty.');
      }
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => runAutoDetect('product')} disabled={detecting || !testUrl}>
              {detecting ? 'AI detecting...' : 'Auto-detect with AI'}
            </Button>
            <Button type="button" variant="outline" onClick={() => runAutoDetect('category')} disabled={detecting || !testUrl}>
              Detect category
            </Button>
            <Button type="button" variant="outline" onClick={runManualCheck} disabled={manualPending || !testUrl}>
              {manualPending ? 'Manual check...' : 'Manual check in browser'}
            </Button>
            <Button type="button" onClick={continueManual} disabled={manualPending || !manualSessionId}>
              Continue after captcha
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manual check opens a visible local browser and pauses here if the page shows a captcha.
          </p>
        </div>

        {manualSessionId ? <ManualSessionPanel sessionId={manualSessionId} /> : null}

        {autoDetectResult ? <AutoDetectPanel result={autoDetectResult} /> : null}

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

function AutoDetectPanel({ result }: { result: Record<string, unknown> }) {
  const validation = result.validation as
    | {
        ok?: boolean;
        fields?: Record<
          string,
          { selector: string; count: number; valid: boolean; reason?: string; sample?: string }
        >;
      }
    | undefined;
  const suggestion = result.suggestion as Record<string, unknown> | undefined;
  const session = result.session as { status?: string; logs?: string[] } | undefined;
  const isManual = result.mode === 'manual' || Boolean(session);
  const preview = result.preview as
    | {
        title?: string;
        price?: number;
        oldPrice?: number;
        currency?: string;
        availability?: string;
        image?: string;
        shipping?: string;
        rating?: number;
        sourcePath?: string;
        confidence?: number;
      }
    | undefined;

  return (
    <div className="space-y-2 rounded-md border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{isManual ? 'Manual browser check' : 'Auto-detect preview'}</div>
        <div className="flex gap-1">
          {isManual ? <Badge variant="outline">visible browser</Badge> : null}
          {result.paused ? <Badge variant="destructive">paused</Badge> : null}
          {typeof result.source === 'string' ? <Badge variant="outline">{result.source}</Badge> : null}
          {validation?.ok != null ? (
            <Badge variant={validation.ok ? 'default' : 'destructive'}>
              {validation.ok ? 'valid' : 'needs review'}
            </Badge>
          ) : null}
        </div>
      </div>
      {typeof result.message === 'string' ? <p className="text-muted-foreground">{result.message}</p> : null}
      {session ? <Field k="Manual status" v={session.status} /> : null}
      {preview ? (
        <div className="space-y-1 rounded border p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Visible browser extraction</span>
            <span className="text-xs text-muted-foreground">
              {preview.sourcePath ?? 'manual'} {preview.confidence != null ? `${Math.round(preview.confidence * 100)}%` : ''}
            </span>
          </div>
          <Field k="Title" v={preview.title} />
          <Field k="Price" v={preview.price != null ? `${preview.price} ${preview.currency ?? ''}` : null} />
          <Field k="Old price" v={preview.oldPrice} />
          <Field k="Availability" v={preview.availability} />
          <Field k="Image" v={preview.image} />
          <Field k="Shipping" v={preview.shipping} />
          <Field k="Rating" v={preview.rating} />
        </div>
      ) : null}
      {suggestion
        ? Object.entries(suggestion)
            .filter(([key]) => key.endsWith('Selector') || key === 'currency' || key === 'confidence')
            .map(([key, value]) => <Field key={key} k={key} v={value} />)
        : null}
      {validation?.fields
        ? Object.entries(validation.fields).map(([key, field]) => (
            <div key={key} className="rounded border p-2">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{key}</span>
                <span className={field.valid ? 'text-emerald-600' : 'text-destructive'}>
                  {field.valid ? `${field.count} matches` : field.reason}
                </span>
              </div>
              {field.sample ? <div className="mt-1 break-all text-xs text-muted-foreground">{field.sample}</div> : null}
            </div>
          ))
        : null}
      {session?.logs?.length ? (
        <div className="text-xs text-muted-foreground">{session.logs[session.logs.length - 1]}</div>
      ) : null}
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
