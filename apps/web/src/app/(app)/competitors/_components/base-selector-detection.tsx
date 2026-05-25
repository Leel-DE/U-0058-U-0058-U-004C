'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { z } from 'zod';
import { schemas } from '@cr/shared';
import { Loader2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-message';
import { detectBaseSelectors } from '@/server/actions/scrape';
import { updateScrapingRules } from '@/server/actions/stores';

export type RuleFormValues = Omit<z.infer<typeof schemas.scrapingRulesSchema>, 'storeId'>;

type SelectorKey = Extract<keyof RuleFormValues, string>;

type DetectionResult = {
  ok?: boolean;
  productSelectors?: Partial<Record<SelectorKey, string | null>>;
  categorySelectors?: Partial<Record<SelectorKey, string | null>>;
  preview?: {
    product?: Record<string, unknown>;
    category?: {
      cardCount?: number;
      cards?: Array<Record<string, unknown>>;
      paginationNext?: string;
      loadMore?: string;
    };
  };
  confidence?: {
    overall?: number;
    product?: number;
    category?: number;
  };
  validation?: {
    product?: { fields?: Record<string, { valid?: boolean; reason?: string; count?: number; sample?: string }> };
    category?: { fields?: Record<string, { valid?: boolean; reason?: string; count?: number; sample?: string }> };
  };
  warnings?: string[];
  logs?: Array<{ message?: string }>;
  message?: string;
};

export const PRODUCT_SELECTOR_FIELDS: Array<{ key: SelectorKey; label: string; placeholder?: string }> = [
  { key: 'titleSelector', label: 'Product title', placeholder: 'h1.product-title' },
  { key: 'priceSelector', label: 'Product price', placeholder: '.price .current' },
  { key: 'oldPriceSelector', label: 'Old price', placeholder: '.old-price' },
  { key: 'availabilitySelector', label: 'Availability', placeholder: '.stock-status' },
  { key: 'imageSelector', label: 'Image', placeholder: '.product-gallery img' },
  { key: 'brandSelector', label: 'Brand', placeholder: '[itemprop="brand"]' },
  { key: 'skuSelector', label: 'SKU', placeholder: '[itemprop="sku"]' },
  { key: 'breadcrumbsSelector', label: 'Breadcrumbs', placeholder: 'nav[aria-label*="breadcrumb"]' },
  { key: 'shippingSelector', label: 'Shipping', placeholder: '.shipping-info' },
  { key: 'ratingSelector', label: 'Rating', placeholder: '.rating-stars' },
];

export const CATEGORY_SELECTOR_FIELDS: Array<{ key: SelectorKey; label: string; placeholder?: string }> = [
  { key: 'productCardSelector', label: 'Product card', placeholder: '.product-card' },
  { key: 'cardTitleSelector', label: 'Card title', placeholder: 'h2' },
  { key: 'cardPriceSelector', label: 'Card price', placeholder: '.price' },
  { key: 'cardOldPriceSelector', label: 'Card old price', placeholder: '.old-price' },
  { key: 'cardImageSelector', label: 'Card image', placeholder: 'img' },
  { key: 'cardLinkSelector', label: 'Card link', placeholder: 'a[href]' },
  { key: 'cardAvailabilitySelector', label: 'Card availability', placeholder: '.stock' },
  { key: 'paginationNextSelector', label: 'Next page', placeholder: 'a[rel="next"]' },
  { key: 'loadMoreSelector', label: 'Load more', placeholder: 'button.load-more' },
];

const EMPTY_VALUES: RuleFormValues = {
  titleSelector: '',
  priceSelector: '',
  oldPriceSelector: '',
  availabilitySelector: '',
  imageSelector: '',
  brandSelector: '',
  skuSelector: '',
  breadcrumbsSelector: '',
  productCardSelector: '',
  cardTitleSelector: '',
  cardPriceSelector: '',
  cardOldPriceSelector: '',
  cardImageSelector: '',
  cardLinkSelector: '',
  cardAvailabilitySelector: '',
  paginationNextSelector: '',
  loadMoreSelector: '',
  shippingSelector: '',
  ratingSelector: '',
  priceRegex: '',
  useJsonLd: true,
  useOpenGraph: true,
};

function valuesFromDetection(result: DetectionResult, base: RuleFormValues = EMPTY_VALUES): RuleFormValues {
  const next = { ...base, useJsonLd: true, useOpenGraph: true };
  const selectors = { ...(result.productSelectors ?? {}), ...(result.categorySelectors ?? {}) };
  for (const [key, value] of Object.entries(selectors)) {
    if (typeof value === 'string') {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function BaseSelectorDetectionForm({
  storeId,
  homepageUrl,
  productUrl,
  categoryUrl,
  useAi,
  autoStart = true,
  onSaved,
}: {
  storeId: string;
  homepageUrl: string;
  productUrl?: string;
  categoryUrl?: string;
  useAi: boolean;
  autoStart?: boolean;
  onSaved?: () => void;
}) {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [values, setValues] = useState<RuleFormValues>(EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [detecting, startDetect] = useTransition();
  const hasStarted = useRef(false);

  function runDetection() {
    setError(null);
    startDetect(async () => {
      const response = await detectBaseSelectors({
        competitorId: storeId,
        homepageUrl,
        productUrl: productUrl ?? '',
        categoryUrl: categoryUrl ?? '',
        useAi,
      });
      if (!response.ok) {
        setError(response.error.message);
        toast.error(response.error.message);
        return;
      }
      const data = response.data as DetectionResult;
      setResult(data);
      setValues(valuesFromDetection(data));
      if (data.ok === false) {
        setError(data.message ?? 'Selector detection failed');
        toast.error(data.message ?? 'Selector detection failed');
      } else {
        toast.success('Selector preview is ready');
      }
    });
  }

  useEffect(() => {
    if (!autoStart || hasStarted.current) return;
    hasStarted.current = true;
    runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const confidence = result?.confidence?.overall ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">Base selector detection</div>
            {result ? <SelectorConfidenceBadge value={confidence} /> : null}
          </div>
          <div className="mt-1 break-all text-xs text-muted-foreground">{homepageUrl}</div>
        </div>
        <Button type="button" variant="outline" onClick={runDetection} disabled={detecting}>
          {detecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {detecting ? 'Detecting' : 'Run again'}
        </Button>
      </div>

      {error ? <FormError message={error} /> : null}

      {detecting && !result ? (
        <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Reading pages and validating selectors...</div>
      ) : null}

      {result ? <SelectorPreviewPanel result={result} /> : null}

      {result ? (
        <EditableSelectorFields
          values={values}
          validation={result.validation}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        />
      ) : null}

      {result ? (
        <SaveDetectedRulesButton
          storeId={storeId}
          values={values}
          onSaved={onSaved}
          onSave={(payload) => updateScrapingRules(payload)}
        />
      ) : null}
    </div>
  );
}

export function SelectorConfidenceBadge({ value }: { value?: number }) {
  const pct = Math.round((value ?? 0) * 100);
  const variant = pct >= 75 ? 'success' : pct >= 55 ? 'warning' : 'destructive';
  return <Badge variant={variant}>{pct}% confidence</Badge>;
}

export function SelectorPreviewPanel({ result }: { result: DetectionResult }) {
  const product = result.preview?.product;
  const category = result.preview?.category;
  const warnings = result.warnings ?? [];

  return (
    <div className="space-y-4 rounded-md border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Detection preview</div>
        <div className="flex gap-2">
          <SelectorConfidenceBadge value={result.confidence?.product ?? 0} />
          <SelectorConfidenceBadge value={result.confidence?.category ?? 0} />
        </div>
      </div>

      {product ? (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Product page</div>
          <PreviewRow label="Title" value={product.title} />
          <PreviewRow label="Price" value={formatPrice(product.price, product.currency)} />
          <PreviewRow label="Old price" value={formatPrice(product.oldPrice, product.currency)} />
          <PreviewRow label="Availability" value={product.availability} />
          <PreviewRow label="Image" value={product.image} />
          <PreviewRow label="Brand" value={product.brand} />
          <PreviewRow label="SKU" value={product.sku} />
          <PreviewRow label="Breadcrumbs" value={Array.isArray(product.breadcrumbs) ? product.breadcrumbs.join(' / ') : undefined} />
        </div>
      ) : null}

      {category ? (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Listing page</div>
            <Badge variant="outline">{category.cardCount ?? 0} cards</Badge>
          </div>
          <PreviewRow label="Pagination" value={category.paginationNext} />
          <PreviewRow label="Load more" value={category.loadMore} />
          <div className="grid gap-2 md:grid-cols-2">
            {(category.cards ?? []).slice(0, 4).map((card, index) => (
              <div key={`${card.link ?? card.title ?? index}`} className="rounded border p-3">
                <PreviewRow label="Title" value={card.title} compact />
                <PreviewRow label="Price" value={formatPrice(card.price, card.currency)} compact />
                <PreviewRow label="Old" value={formatPrice(card.oldPrice, card.currency)} compact />
                <PreviewRow label="Availability" value={card.availability} compact />
                <PreviewRow label="Image" value={card.image} compact />
                <PreviewRow label="Link" value={card.link} compact />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EditableSelectorFields({
  values,
  validation,
  onChange,
}: {
  values: RuleFormValues;
  validation?: DetectionResult['validation'];
  onChange: (key: SelectorKey, value: string) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SelectorFieldGroup
        title="Product selectors"
        fields={PRODUCT_SELECTOR_FIELDS}
        values={values}
        validation={validation?.product?.fields}
        onChange={onChange}
      />
      <SelectorFieldGroup
        title="Listing selectors"
        fields={CATEGORY_SELECTOR_FIELDS}
        values={values}
        validation={validation?.category?.fields}
        onChange={onChange}
      />
    </div>
  );
}

function SelectorFieldGroup({
  title,
  fields,
  values,
  validation,
  onChange,
}: {
  title: string;
  fields: Array<{ key: SelectorKey; label: string; placeholder?: string }>;
  values: RuleFormValues;
  validation?: Record<string, { valid?: boolean; reason?: string; count?: number; sample?: string }>;
  onChange: (key: SelectorKey, value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="font-medium">{title}</div>
      {fields.map((field) => {
        const status = validation?.[field.key];
        return (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              {status ? (
                <Badge variant={status.valid ? 'success' : 'destructive'}>
                  {status.valid ? `${status.count ?? 0} matches` : 'review'}
                </Badge>
              ) : null}
            </div>
            <Input
              id={field.key}
              value={typeof values[field.key] === 'string' ? String(values[field.key] ?? '') : ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
            {status?.reason ? <p className="text-xs text-destructive">{status.reason}</p> : null}
            {status?.sample ? <p className="break-all text-xs text-muted-foreground">{status.sample}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function SaveDetectedRulesButton({
  storeId,
  values,
  onSaved,
  onSave,
}: {
  storeId: string;
  values: RuleFormValues;
  onSaved?: () => void;
  onSave: (payload: z.infer<typeof schemas.scrapingRulesSchema>) => Promise<{ ok: true; data: unknown } | { ok: false; error: { message: string } }>;
}) {
  const [pending, start] = useTransition();
  const payload = useMemo(() => ({ storeId, ...values }), [storeId, values]);

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const result = await onSave(payload);
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success('Detected rules saved');
          onSaved?.();
        });
      }}
    >
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      {pending ? 'Saving' : 'Save detected rules'}
    </Button>
  );
}

function PreviewRow({ label, value, compact = false }: { label: string; value: unknown; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-0.5' : 'flex items-start gap-3'}>
      <span className={compact ? 'block text-xs uppercase text-muted-foreground' : 'w-28 shrink-0 text-xs uppercase text-muted-foreground'}>
        {label}
      </span>
      <span className="min-w-0 flex-1 break-all">
        {value == null || value === '' ? <span className="text-muted-foreground">-</span> : String(value)}
      </span>
    </div>
  );
}

function formatPrice(value: unknown, currency: unknown) {
  if (typeof value !== 'number') return undefined;
  return `${value} ${typeof currency === 'string' ? currency : ''}`.trim();
}
