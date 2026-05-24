'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { startSiteDiscovery } from '@/server/actions/discovery';

type PresetKey = 'quick' | 'normal' | 'deep' | 'full' | 'custom';

interface DiscoveryLimits {
  maxPages: number;
  maxProducts: number;
  crawlDepth: number;
  maxPagesPerCategory: number;
  maxScrollIterations: number;
}

interface DiscoveryFormDefaults extends Partial<DiscoveryLimits> {
  mode?: 'category_scan' | 'detail_enrichment';
  respectRobotsTxt?: boolean;
  useAi?: boolean;
  useManualCaptcha?: boolean;
  includePatterns?: string[] | string;
  excludePatterns?: string[] | string;
  domainAllowlist?: string[] | string;
}

const PRESETS: Record<Exclude<PresetKey, 'custom'>, DiscoveryLimits & {
  label: string;
  load: string;
  description: string;
}> = {
  quick: {
    label: 'Quick scan',
    load: 'Low',
    description: 'Small sample for smoke checks and first setup.',
    maxPages: 50,
    maxProducts: 300,
    crawlDepth: 2,
    maxPagesPerCategory: 5,
    maxScrollIterations: 3,
  },
  normal: {
    label: 'Normal scan',
    load: 'Medium',
    description: 'Default discovery for most competitor catalogs.',
    maxPages: 300,
    maxProducts: 2000,
    crawlDepth: 4,
    maxPagesPerCategory: 15,
    maxScrollIterations: 8,
  },
  deep: {
    label: 'Deep scan',
    load: 'High',
    description: 'Broader category traversal and pagination coverage.',
    maxPages: 1000,
    maxProducts: 10000,
    crawlDepth: 6,
    maxPagesPerCategory: 30,
    maxScrollIterations: 15,
  },
  full: {
    label: 'Full catalog',
    load: 'Very high',
    description: 'Heavy crawl for large catalog extraction.',
    maxPages: 5000,
    maxProducts: 50000,
    crawlDepth: 8,
    maxPagesPerCategory: 100,
    maxScrollIterations: 30,
  },
};

const DEFAULT_EXCLUDES = '/account\n/login\n/cart\n/checkout\n/search\n/suche';

function asDefaults(value: unknown): DiscoveryFormDefaults {
  return value && typeof value === 'object' ? (value as DiscoveryFormDefaults) : {};
}

function listToText(value: string[] | string | undefined, fallback = '') {
  if (Array.isArray(value)) return value.join('\n');
  return value ?? fallback;
}

function clampNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function DiscoveryStartForm({
  storeId,
  defaultUrl,
  savedPreset,
  savedDefaults,
}: {
  storeId: string;
  defaultUrl: string;
  savedPreset?: string | null;
  savedDefaults?: unknown;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaults = useMemo(() => asDefaults(savedDefaults), [savedDefaults]);
  const initialPreset: PresetKey =
    savedPreset === 'quick' || savedPreset === 'normal' || savedPreset === 'deep' || savedPreset === 'full'
      ? savedPreset
      : savedPreset === 'custom'
        ? 'custom'
        : 'normal';
  const initialLimits = initialPreset === 'custom' ? PRESETS.normal : PRESETS[initialPreset];

  const [startUrl, setStartUrl] = useState(defaultUrl);
  const [preset, setPreset] = useState<PresetKey>(initialPreset);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [limits, setLimits] = useState<DiscoveryLimits>({
    maxPages: clampNumber(defaults.maxPages, initialLimits.maxPages),
    maxProducts: clampNumber(defaults.maxProducts, initialLimits.maxProducts),
    crawlDepth: clampNumber(defaults.crawlDepth, initialLimits.crawlDepth),
    maxPagesPerCategory: clampNumber(defaults.maxPagesPerCategory, initialLimits.maxPagesPerCategory),
    maxScrollIterations: clampNumber(defaults.maxScrollIterations, initialLimits.maxScrollIterations),
  });
  const [mode, setMode] = useState<'category_scan' | 'detail_enrichment'>(defaults.mode ?? 'category_scan');
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(defaults.respectRobotsTxt ?? true);
  const [useAi, setUseAi] = useState(defaults.useAi ?? false);
  const [useManualCaptcha, setUseManualCaptcha] = useState(defaults.useManualCaptcha ?? true);
  const [includePatterns, setIncludePatterns] = useState(listToText(defaults.includePatterns));
  const [excludePatterns, setExcludePatterns] = useState(listToText(defaults.excludePatterns, DEFAULT_EXCLUDES));
  const [domainAllowlist, setDomainAllowlist] = useState(listToText(defaults.domainAllowlist));

  const presetMeta = preset === 'custom' ? null : PRESETS[preset];
  const loadLabel = presetMeta?.load ?? 'Custom';

  function setPresetValue(value: PresetKey) {
    setPreset(value);
    if (value !== 'custom') {
      const next = PRESETS[value];
      setLimits({
        maxPages: next.maxPages,
        maxProducts: next.maxProducts,
        crawlDepth: next.crawlDepth,
        maxPagesPerCategory: next.maxPagesPerCategory,
        maxScrollIterations: next.maxScrollIterations,
      });
    }
  }

  function updateLimit(key: keyof DiscoveryLimits, value: string) {
    setPreset('custom');
    setLimits((current) => ({ ...current, [key]: Number(value) }));
  }

  function start() {
    startTransition(async () => {
      const res = await startSiteDiscovery({
        storeId,
        startUrl,
        ...limits,
        concurrency: 1,
        mode,
        respectRobotsTxt,
        useAi,
        useManualCaptcha,
        includePatterns,
        excludePatterns,
        domainAllowlist,
        discoveryPreset: preset,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Discovery started');
      router.push(`/competitors/${storeId}/discovery/${res.data.runId}`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Start URL">
          <Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} />
        </Field>
        <Field label="Discovery mode">
          <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category_scan">Fast category scan only</SelectItem>
              <SelectItem value="detail_enrichment">Category scan + product detail enrichment</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <Field label="Discovery preset">
            <Select value={preset} onValueChange={(value) => setPresetValue(value as PresetKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">Quick scan</SelectItem>
                <SelectItem value="normal">Normal scan</SelectItem>
                <SelectItem value="deep">Deep scan</SelectItem>
                <SelectItem value="full">Full catalog</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-wrap items-end gap-2 text-sm text-muted-foreground">
            <Badge variant={preset === 'full' ? 'destructive' : preset === 'deep' ? 'secondary' : 'outline'}>
              Load: {loadLabel}
            </Badge>
            <span>{presetMeta?.description ?? 'Manual advanced values will be reused for this competitor.'}</span>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-5">
          <Metric label="Pages" value={limits.maxPages} />
          <Metric label="Products" value={limits.maxProducts} />
          <Metric label="Depth" value={limits.crawlDepth} />
          <Metric label="Pages/category" value={limits.maxPagesPerCategory} />
          <Metric label="Scrolls" value={limits.maxScrollIterations} />
        </div>
      </div>

      <Button type="button" variant="outline" onClick={() => setAdvancedOpen((value) => !value)}>
        {advancedOpen ? 'Hide advanced settings' : 'Show advanced settings'}
      </Button>

      {advancedOpen ? (
        <div className="space-y-4 rounded-md border p-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <NumberField label="Max pages" value={limits.maxPages} min={1} max={5000} onChange={(value) => updateLimit('maxPages', value)} />
            <NumberField label="Max products" value={limits.maxProducts} min={1} max={50000} onChange={(value) => updateLimit('maxProducts', value)} />
            <NumberField label="Crawl depth" value={limits.crawlDepth} min={0} max={8} onChange={(value) => updateLimit('crawlDepth', value)} />
            <NumberField label="Pages/category" value={limits.maxPagesPerCategory} min={1} max={100} onChange={(value) => updateLimit('maxPagesPerCategory', value)} />
            <NumberField label="Scroll iterations" value={limits.maxScrollIterations} min={0} max={30} onChange={(value) => updateLimit('maxScrollIterations', value)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Domain allowlist">
              <Textarea value={domainAllowlist} onChange={(e) => setDomainAllowlist(e.target.value)} placeholder="multicycle.de" />
            </Field>
            <Field label="Path include filters">
              <Textarea value={includePatterns} onChange={(e) => setIncludePatterns(e.target.value)} placeholder="/shop, /bikes" />
            </Field>
            <Field label="Path exclude filters">
              <Textarea value={excludePatterns} onChange={(e) => setExcludePatterns(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Toggle label="Respect robots.txt" checked={respectRobotsTxt} onCheckedChange={setRespectRobotsTxt} />
        <Toggle label="Use AI detection fallback" checked={useAi} onCheckedChange={setUseAi} />
        <Toggle label="Use manual captcha mode" checked={useManualCaptcha} onCheckedChange={setUseManualCaptcha} />
      </div>

      <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
        {preset === 'full' ? <p>Full catalog can be slow and heavy on local resources.</p> : null}
        {limits.maxScrollIterations >= 15 ? <p>High scroll iterations may consume RAM on JS-heavy shops.</p> : null}
        {!respectRobotsTxt ? <p>Respect robots.txt is recommended for discovery runs.</p> : null}
        {useManualCaptcha ? <p>Manual captcha mode may require user interaction in a local browser window.</p> : null}
      </div>

      <Button onClick={start} disabled={pending || !startUrl}>
        {pending ? 'Starting...' : 'Start discovery'}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value.toLocaleString()}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
