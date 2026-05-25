import { AlertTriangle, CheckCircle2, ExternalLink, Store } from 'lucide-react';
import type { StoreAnalysisResult } from '@cr/shared';
import { Badge } from '@/components/ui/badge';
import { DetectionConfidenceBadge } from './DetectionConfidenceBadge';
import { ScrapingStrategyCard } from './ScrapingStrategyCard';
import { SelectorPreviewPanel } from './SelectorPreviewPanel';

export function StoreAnalysisPreview({ analysis }: { analysis: StoreAnalysisResult }) {
  const detected = [
    { label: 'Product pages', ok: Boolean(analysis.examples.productPageUrl) },
    { label: 'Category pages', ok: Boolean(analysis.examples.categoryPageUrl) },
    { label: 'Product cards', ok: Boolean(analysis.previews.category?.cardCount) },
    { label: 'Price selectors', ok: Boolean(analysis.selectors.productSelectors.priceSelector || analysis.selectors.categorySelectors.cardPriceSelector) },
    { label: 'Pagination', ok: Boolean(analysis.selectors.categorySelectors.paginationNextSelector || analysis.selectors.categorySelectors.loadMoreSelector) },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-md border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Store className="h-4 w-4" />
              Store detected
            </div>
            <h2 className="truncate text-2xl font-semibold tracking-tight">{analysis.store.name}</h2>
            <div className="mt-1 text-sm text-muted-foreground">{analysis.store.domain}</div>
          </div>
          <DetectionConfidenceBadge confidence={analysis.confidence} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Fact label="Framework" value={analysis.framework.label} />
          <Fact label="Rendering" value={renderingLabel(analysis.renderingStrategy.strategy)} />
          <Fact label="Currency" value={analysis.store.currency} />
        </div>
      </div>

      <ScrapingStrategyCard analysis={analysis} />

      <div className="rounded-md border p-4">
        <div className="mb-3 text-sm font-medium">Detected</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          {detected.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className={item.ok ? 'h-4 w-4 text-success' : 'h-4 w-4 text-muted-foreground/40'} />
              <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <SelectorPreviewPanel analysis={analysis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border p-4">
          <div className="mb-3 text-sm font-medium">Found examples</div>
          <Example label="Product page" value={analysis.examples.productPageUrl} />
          <Example label="Category page" value={analysis.examples.categoryPageUrl} />
          <Example label="Sitemaps" value={analysis.examples.sitemapUrls[0]} />
        </div>

        <div className="rounded-md border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Warnings
          </div>
          {analysis.warnings.length ? (
            <div className="space-y-2">
              {analysis.warnings.slice(0, 5).map((warning) => (
                <div key={warning} className="text-sm text-muted-foreground">{warning}</div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No blocking warnings detected.</div>
          )}
        </div>
      </div>

      <details className="rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">Detection logs</summary>
        <div className="mt-3 max-h-64 space-y-2 overflow-auto text-xs text-muted-foreground">
          {analysis.logs.slice(0, 40).map((log, index) => (
            <div key={`${log.message}-${index}`}>
              <Badge variant={log.level === 'warn' ? 'warning' : 'outline'}>{log.level}</Badge>
              <span className="ml-2">{log.message}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value ?? 'Not detected'}</div>
    </div>
  );
}

function Example({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2 grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex min-w-0 items-center gap-1">
        {value ? <ExternalLink className="h-3.5 w-3.5 shrink-0" /> : null}
        <span className="truncate">{value ?? 'Not detected'}</span>
      </div>
    </div>
  );
}

function renderingLabel(value: string) {
  const labels: Record<string, string> = {
    static_html: 'Static HTML',
    hybrid: 'Hybrid JS',
    js_heavy: 'JS-heavy',
    spa: 'SPA',
  };
  return labels[value] ?? value;
}
