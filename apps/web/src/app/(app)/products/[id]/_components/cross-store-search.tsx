'use client';

import { useState, useTransition } from 'react';
import { Database, ExternalLink, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency, timeAgo } from '@/lib/utils';
import { findCandidatesInScrapedData, matchProductByUrl } from '@/server/actions/cross-store-search';
import type { CrossStoreCandidate, ProductMissingStore } from '@/server/products/types';

interface Props {
  myProductId: string;
  productTitle: string;
  productBrand: string | null;
  missingStores: ProductMissingStore[];
}

interface StoreScanState {
  candidates: CrossStoreCandidate[];
  scannedAt: number;
}

export function CrossStoreSearch({ myProductId, productTitle, productBrand, missingStores }: Props) {
  const stocked = missingStores.filter((store) => store.scrapedCount > 0);
  const empty = missingStores.filter((store) => store.scrapedCount === 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(stocked.map((s) => s.storeId)));
  const [scanResults, setScanResults] = useState<Record<string, StoreScanState>>({});
  const [matching, setMatching] = useState<string | null>(null);
  const [matchedNow, setMatchedNow] = useState<Set<string>>(new Set());
  const [matchError, setMatchError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, startScanning] = useTransition();

  function toggleStore(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === stocked.length ? new Set() : new Set(stocked.map((s) => s.storeId))));
  }

  function findInDb() {
    if (selected.size === 0) return;
    setScanError(null);
    const ids = Array.from(selected);
    startScanning(async () => {
      try {
        const res = await findCandidatesInScrapedData({
          myProductId,
          storeIds: ids,
          perStoreLimit: 6,
          minSimilarity: 0.2,
        });
        if (!res.ok) {
          setScanError(res.error.message ?? 'Search failed');
          return;
        }
        const byStore = res.data.byStore;
        const next: Record<string, StoreScanState> = {};
        for (const storeId of ids) {
          next[storeId] = { candidates: byStore[storeId] ?? [], scannedAt: Date.now() };
        }
        setScanResults((prev) => ({ ...prev, ...next }));
      } catch (err) {
        setScanError(err instanceof Error ? err.message : 'search_failed');
      }
    });
  }

  async function confirmMatch(storeId: string, url: string) {
    const key = `${storeId}:${url}`;
    setMatching(key);
    setMatchError(null);
    try {
      const res = await matchProductByUrl({ myProductId, storeId, url });
      if (!res.ok) {
        setMatchError(res.error.message ?? 'Failed to create match');
        return;
      }
      setMatchedNow((prev) => new Set(prev).add(key));
    } finally {
      setMatching(null);
    }
  }

  if (missingStores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cross-store coverage</CardTitle>
          <CardDescription>This product is already linked to every competitor in your workspace.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const allSelected = stocked.length > 0 && selected.size === stocked.length;
  const totalScraped = stocked.reduce((sum, store) => sum + store.scrapedCount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" /> Find this product in your scraped data
            </CardTitle>
            <CardDescription>
              {stocked.length.toLocaleString()} store(s) without a confirmed match · searching across{' '}
              {totalScraped.toLocaleString()} scraped products. Pure database lookup — no external network calls.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={findInDb} disabled={selected.size === 0 || scanning}>
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Find in my DB
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Looking for:</span>
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
            {[productBrand, productTitle].filter(Boolean).join(' ')}
          </code>
        </div>
        {matchError ? (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {matchError}
          </div>
        ) : null}
        {scanError ? (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {scanError}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button type="button" className="hover:underline" onClick={toggleAll}>
            {allSelected ? 'Clear selection' : 'Select all stores with data'}
          </button>
          <span>{selected.size} of {stocked.length} selected</span>
        </div>

        <ul className="grid gap-2">
          {stocked.map((store) => {
            const result = scanResults[store.storeId];
            const isSelected = selected.has(store.storeId);
            return (
              <li key={store.storeId} className="rounded-md border bg-background">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isSelected}
                      onChange={() => toggleStore(store.storeId)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{store.storeName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {store.scrapedCount.toLocaleString()} scraped
                        </Badge>
                        {store.status && store.status !== 'active' ? (
                          <Badge variant="warning">{store.status}</Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{store.storeDomain ?? '—'}</div>
                    </div>
                  </label>
                  <div className="flex items-center gap-2">
                    <MatchByUrlForm
                      storeId={store.storeId}
                      onSubmit={(url) => confirmMatch(store.storeId, url)}
                      busy={matching?.startsWith(`${store.storeId}:`)}
                    />
                    <Button asChild size="sm" variant="ghost">
                      <a href={store.searchUrl} target="_blank" rel="noreferrer">
                        Open store <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
                {result ? (
                  result.candidates.length === 0 ? (
                    <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      No similar products found in this store's scraped data.{' '}
                      <a href={store.searchUrl} target="_blank" rel="noreferrer" className="text-foreground hover:underline">
                        Open store search →
                      </a>
                    </div>
                  ) : (
                    <div className="border-t bg-muted/10 px-3 py-2">
                      <div className="mb-2 text-[11px] uppercase text-muted-foreground">
                        Top {result.candidates.length} candidate(s) from your scraped data
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {result.candidates.map((card) => (
                          <CandidateCard
                            key={card.competitorProductId}
                            card={card}
                            matched={matchedNow.has(`${store.storeId}:${card.url}`)}
                            busy={matching === `${store.storeId}:${card.url}`}
                            onMatch={() => confirmMatch(store.storeId, card.url)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>

        {empty.length > 0 ? (
          <details className="rounded-md border bg-background">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">
              {empty.length.toLocaleString()} store(s) without scraped data yet — expand for manual options
            </summary>
            <ul className="grid gap-1 border-t p-3 text-xs">
              {empty.map((store) => (
                <li key={store.storeId} className="flex items-center justify-between gap-3 rounded border bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium">{store.storeName}</span>
                    <span className="ml-2 text-muted-foreground">{store.storeDomain ?? ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MatchByUrlForm
                      storeId={store.storeId}
                      onSubmit={(url) => confirmMatch(store.storeId, url)}
                      busy={matching?.startsWith(`${store.storeId}:`)}
                    />
                    <Button asChild size="sm" variant="outline">
                      <a href={store.searchUrl} target="_blank" rel="noreferrer">
                        Open store search <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CandidateCard({
  card,
  matched,
  busy,
  onMatch,
}: {
  card: CrossStoreCandidate;
  matched: boolean;
  busy: boolean;
  onMatch: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background p-2">
      {card.imageUrl ? (
        <span
          className="h-12 w-12 shrink-0 rounded border bg-muted bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${card.imageUrl.replace(/"/g, '%22')}")` }}
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <a
            href={card.url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-xs font-medium hover:underline"
          >
            {card.title}
          </a>
          <MatchScoreBadge score={card.similarity} method={card.matchMethod} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatCurrency(card.price, card.currency ?? 'EUR')}</span>
          {card.availability ? <AvailabilityPill value={card.availability} /> : null}
        </div>
        {card.lastScrapedAt ? (
          <div className="text-[10px] text-muted-foreground">scraped {timeAgo(card.lastScrapedAt)}</div>
        ) : null}
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {card.reasons.slice(0, 1).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
        <Button
          size="sm"
          variant={matched ? 'outline' : card.similarity >= 0.5 ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          disabled={matched || busy}
          onClick={onMatch}
        >
          {matched ? 'Matched ✓' : busy ? 'Matching…' : 'Match this'}
        </Button>
      </div>
    </div>
  );
}

function MatchScoreBadge({ score, method }: { score: number; method: CrossStoreCandidate['matchMethod'] }) {
  const pct = Math.round(score * 100);
  if (method === 'gtin') return <Badge variant="success">GTIN</Badge>;
  if (method === 'sku') return <Badge variant="success">SKU</Badge>;
  const variant = score >= 0.6 ? 'success' : score >= 0.35 ? 'warning' : 'secondary';
  return <Badge variant={variant}>{pct}%</Badge>;
}

function AvailabilityPill({ value }: { value: string }) {
  if (value === 'in_stock') return <span className="text-success">in stock</span>;
  if (value === 'out_of_stock') return <span className="text-destructive">out of stock</span>;
  return <span>{value}</span>;
}

function MatchByUrlForm({
  storeId,
  onSubmit,
  busy,
}: {
  storeId: string;
  onSubmit: (url: string) => void;
  busy: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Match URL
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed)) return;
        onSubmit(trimmed);
        setUrl('');
        setOpen(false);
      }}
    >
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://store/product…"
        className="h-9 w-64"
        autoFocus
        name={`url-${storeId}`}
      />
      <Button type="submit" size="sm" disabled={busy}>{busy ? '…' : 'Save'}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </form>
  );
}
