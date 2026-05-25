import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  GitCompare,
  Globe,
  PackageSearch,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getContext } from '@/lib/auth';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import { getProductDetail } from '@/server/products/queries';
import type {
  ProductCompetitorComparison,
  ProductDetail,
  ProductEvent,
  ProductIdentifiers,
  ProductPriceStats,
} from '@/server/products/types';
import {
  AvailabilityTimeline,
  CheapestRotationChart,
  CompetitorActivityHeatmap,
  DiscountTimeline,
  ProductPriceTimeline,
  ProductSpreadChart,
} from '../_components/product-charts';
import { CopyableValue } from './_components/copyable';
import { CrossStoreSearch } from './_components/cross-store-search';
import { OpenAllListingsButton } from './_components/open-all-listings';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const product = await getProductDetail(ctx.orgId, id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <ProductHeader product={product} />
      <MarketOverview product={product} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <CompetitorComparison product={product} />
        <div className="space-y-4">
          <IdentifiersCard product={product} />
          <PriceStatsCard stats={product.priceStats} currency={product.overview.currency} />
        </div>
      </div>
      <CrossStoreSearch
        myProductId={product.id}
        productTitle={product.canonicalTitle}
        productBrand={product.brand}
        missingStores={product.missingFromStores}
      />
      <HistoricalCharts product={product} />
      <SnapshotTimeline events={product.events} />
    </div>
  );
}

function ProductHeader({ product }: { product: ProductDetail }) {
  const specs = [
    product.specs.year,
    product.specs.bikeType,
    product.specs.motor,
    product.specs.battery,
    product.specs.wheelSize,
    product.specs.frameMaterial,
  ].filter(Boolean);
  return (
    <header className="grid gap-5 xl:grid-cols-[220px_1fr_320px]">
      <div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {product.imageUrl ? (
          <span
            className="h-full w-full bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${product.imageUrl.replace(/"/g, '%22')}")` }}
            aria-hidden="true"
          />
        ) : <PackageSearch className="h-12 w-12 text-muted-foreground" />}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={product.entityType === 'normalized' ? 'success' : 'secondary'}>
            {product.entityType === 'normalized' ? 'normalized product' : 'raw competitor product'}
          </Badge>
          <Badge variant="outline">{Math.round(product.confidence * 100)}% confidence</Badge>
          {product.competitors.length > 1 ? (
            <Badge variant="default">{product.competitors.length} stores tracked</Badge>
          ) : null}
        </div>
        <h1 className="max-w-5xl text-2xl font-semibold tracking-tight">{product.canonicalTitle}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{product.brand ?? 'Unknown brand'}</span>
          <span>{product.category ?? 'Uncategorized'}</span>
          <span>{product.competitorsCount} competitors</span>
          <span>updated {timeAgo(product.lastUpdated)}</span>
          {product.url ? (
            <a className="inline-flex items-center gap-1 hover:underline" href={product.url} target="_blank" rel="noreferrer">
              <Globe className="h-3.5 w-3.5" /> My URL
            </a>
          ) : null}
        </div>
        {specs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {specs.map((spec) => <Badge key={String(spec)} variant="outline">{spec}</Badge>)}
          </div>
        ) : null}
      </div>
      <ProductActionsCard product={product} />
    </header>
  );
}

function ProductActionsCard({ product }: { product: ProductDetail }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        <Button asChild variant="outline"><Link href={`/products/compare?ids=${product.id}`}><GitCompare className="mr-2 h-4 w-4" />Open compare</Link></Button>
        <OpenAllListingsButton competitors={product.competitors} />
        <Button asChild variant="outline"><Link href="/matches">Manual match</Link></Button>
        <Button asChild variant="outline"><Link href="/exports">Export intelligence</Link></Button>
      </CardContent>
    </Card>
  );
}

function MarketOverview({ product }: { product: ProductDetail }) {
  const currency = product.overview.currency;
  const myVsMin =
    product.myPrice != null && product.overview.minPrice != null
      ? ((product.myPrice - product.overview.minPrice) / product.overview.minPrice) * 100
      : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      <Metric label="Cheapest competitor" value={product.overview.cheapestCompetitor ?? '—'} sub={formatCurrency(product.overview.minPrice, currency)} />
      <Metric label="Highest price" value={formatCurrency(product.overview.highestPrice, currency)} />
      <Metric label="Average price" value={formatCurrency(product.overview.averagePrice, currency)} />
      <Metric
        label="Spread"
        value={formatCurrency(product.overview.competitorSpread, currency)}
        sub={product.overview.spreadPct == null ? undefined : `${product.overview.spreadPct.toFixed(1)}% range`}
      />
      <Metric label="Current discount" value={formatPct(product.overview.currentDiscountPct)} />
      <Metric
        label="Stock"
        value={`${Math.round(product.overview.stockRatio * 100)}% in stock`}
        sub={`${product.overview.inStockCount} in · ${product.overview.outOfStockCount} out`}
      />
      <Metric label="Volatility" value={formatPct(product.overview.volatilityScore)} />
      <Metric label="Market trend" value={product.overview.marketTrend} />
      {product.myPrice != null ? (
        <Metric
          label="My price vs cheapest"
          value={
            myVsMin == null
              ? formatCurrency(product.myPrice, currency)
              : `${myVsMin >= 0 ? '+' : ''}${myVsMin.toFixed(1)}%`
          }
          sub={formatCurrency(product.myPrice, currency)}
          tone={myVsMin != null && myVsMin > 0 ? 'warning' : 'good'}
        />
      ) : null}
    </div>
  );
}

function CompetitorComparison({ product }: { product: ProductDetail }) {
  const minPrice = product.overview.minPrice;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor comparison</CardTitle>
        <CardDescription>Current live market position for each linked competitor product.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-y bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Competitor</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Vs cheapest</th>
              <th className="px-4 py-2">Old / Discount</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2">Shipping</th>
              <th className="px-4 py-2">SKU / GTIN</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2">Confidence</th>
              <th className="px-4 py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {product.competitors.map((row) => (
              <CompetitorRow key={row.competitorProductId} row={row} cheapest={minPrice} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CompetitorRow({ row, cheapest }: { row: ProductCompetitorComparison; cheapest: number | null }) {
  const deltaVsCheapest =
    row.currentPrice != null && cheapest != null && cheapest > 0
      ? ((row.currentPrice - cheapest) / cheapest) * 100
      : null;
  const isCheapest = cheapest != null && row.currentPrice === cheapest;
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          {row.imageUrl ? (
            <span
              className="h-10 w-10 shrink-0 rounded border bg-muted bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${row.imageUrl.replace(/"/g, '%22')}")` }}
              aria-hidden="true"
            />
          ) : null}
          <div className="min-w-0">
            <Link href={`/competitors/products/${row.competitorProductId}`} className="font-medium hover:underline">
              {row.competitorName}
            </Link>
            <div className="line-clamp-1 text-xs text-muted-foreground">{row.title}</div>
            {row.competitorDomain ? (
              <div className="text-[11px] text-muted-foreground">{row.competitorDomain}</div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums">
        <div className="font-semibold">{formatCurrency(row.currentPrice, row.currency)}</div>
        {isCheapest ? <Badge variant="success">cheapest</Badge> : null}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {deltaVsCheapest == null ? (
          <span className="text-muted-foreground">—</span>
        ) : deltaVsCheapest === 0 ? (
          <Badge variant="success">match</Badge>
        ) : (
          <span className={deltaVsCheapest > 0 ? 'text-destructive' : 'text-success'}>
            {deltaVsCheapest > 0 ? '+' : ''}
            {deltaVsCheapest.toFixed(1)}%
          </span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {row.oldPrice != null ? (
          <div className="text-muted-foreground line-through">{formatCurrency(row.oldPrice, row.currency)}</div>
        ) : <span className="text-muted-foreground">—</span>}
        {row.discountPct != null ? <Badge variant="warning">{formatPct(row.discountPct)}</Badge> : null}
      </td>
      <td className="px-4 py-3">
        <AvailabilityBadge value={row.availability} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{row.shipping ?? '—'}</td>
      <td className="px-4 py-3 text-xs">
        {row.sku ? <div>SKU: <span className="font-mono">{row.sku}</span></div> : null}
        {row.gtin ? <div>GTIN: <span className="font-mono">{row.gtin}</span></div> : null}
        {!row.sku && !row.gtin ? <span className="text-muted-foreground">—</span> : null}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{timeAgo(row.lastUpdate)}</td>
      <td className="px-4 py-3 tabular-nums">{row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}</td>
      <td className="px-4 py-3">
        <a href={row.url} target="_blank" rel="noreferrer" aria-label="Open competitor URL">
          <ExternalLink className="h-4 w-4" />
        </a>
      </td>
    </tr>
  );
}

function AvailabilityBadge({ value }: { value: string | null }) {
  if (value === 'in_stock') return <Badge variant="success">in stock</Badge>;
  if (value === 'out_of_stock') return <Badge variant="destructive">out of stock</Badge>;
  if (value === 'limited') return <Badge variant="warning">limited</Badge>;
  if (value === 'preorder') return <Badge variant="warning">preorder</Badge>;
  return <Badge variant="secondary">unknown</Badge>;
}

function IdentifiersCard({ product }: { product: ProductDetail }) {
  const id = product.identifiers as ProductIdentifiers;
  const aliases = Array.from(new Set(id.competitorTitles)).slice(0, 8);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identifiers</CardTitle>
        <CardDescription>How this product is keyed across competitor listings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <IdentifierRow label="Brand" value={id.brand ?? product.brand} />
        <IdentifierRow label="SKU" value={id.sku} copy />
        <IdentifierRow label="GTIN / EAN" value={id.gtin} copy />
        {id.competitorSkus.length > 0 ? (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Competitor SKUs</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {id.competitorSkus.slice(0, 8).map((sku) => (
                <CopyableValue key={sku} value={sku} className="rounded-md border bg-muted/30 px-2 py-0.5 font-mono text-xs" />
              ))}
            </div>
          </div>
        ) : null}
        {id.competitorGtins.length > 0 ? (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Competitor GTINs</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {id.competitorGtins.slice(0, 8).map((gtin) => (
                <CopyableValue key={gtin} value={gtin} className="rounded-md border bg-muted/30 px-2 py-0.5 font-mono text-xs" />
              ))}
            </div>
          </div>
        ) : null}
        {aliases.length > 0 ? (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Listed as</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {aliases.map((alias) => <li key={alias} className="line-clamp-1">{alias}</li>)}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IdentifierRow({ label, value, copy }: { label: string; value: string | null | undefined; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      {value ? (
        copy ? (
          <CopyableValue value={value} className="rounded-md border bg-muted/30 px-2 py-0.5 font-mono text-xs" />
        ) : (
          <span className="text-sm font-medium">{value}</span>
        )
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

function PriceStatsCard({ stats, currency }: { stats: ProductPriceStats; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4" /> Historical price stats
        </CardTitle>
        <CardDescription>Aggregates from up to 180 days of snapshots.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <StatBlock label="Median (90d)" value={formatCurrency(stats.median, currency)} />
        <StatBlock label="Best in 30d" value={formatCurrency(stats.best30d, currency)} />
        <StatBlock label="Worst in 30d" value={formatCurrency(stats.worst30d, currency)} />
        <StatBlock label="Best in 90d" value={formatCurrency(stats.best90d, currency)} />
        <StatBlock label="Worst in 90d" value={formatCurrency(stats.worst90d, currency)} />
        <StatBlock
          label="Cheapest streak"
          value={stats.cheapestStreakDays == null ? '—' : `${stats.cheapestStreakDays}d`}
        />
      </CardContent>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function HistoricalCharts({ product }: { product: ProductDetail }) {
  if (product.priceTimeline.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price timeline</CardTitle>
          <CardDescription>No historical price snapshots captured for this product yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Price timeline</CardTitle>
          <CardDescription>Multi-competitor overlay with brush zoom.</CardDescription>
        </CardHeader>
        <CardContent><ProductPriceTimeline data={product.priceTimeline} /></CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Price spread</CardTitle></CardHeader>
          <CardContent><ProductSpreadChart data={product.spreadTimeline} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Discount timeline</CardTitle></CardHeader>
          <CardContent><DiscountTimeline data={product.priceTimeline} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Availability timeline</CardTitle></CardHeader>
          <CardContent><AvailabilityTimeline data={product.priceTimeline} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cheapest seller rotation</CardTitle></CardHeader>
          <CardContent><CheapestRotationChart data={product.priceTimeline} /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Competitor activity heatmap</CardTitle></CardHeader>
        <CardContent><CompetitorActivityHeatmap data={product.priceTimeline} /></CardContent>
      </Card>
    </div>
  );
}

function SnapshotTimeline({ events }: { events: ProductEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Snapshot timeline</CardTitle>
        <CardDescription>Price changes, stock changes, extraction warnings, latest snapshots, and match events.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">No timeline events captured yet.</p> : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3">
                <EventIcon event={event} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{event.label}</div>
                  <div className="text-xs text-muted-foreground">{event.type.replace(/_/g, ' ')} · {timeAgo(event.timestamp)}</div>
                  <Separator className="mt-3" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventIcon({ event }: { event: ProductEvent }) {
  const critical = event.status === 'critical' || event.type === 'selector_issue';
  return (
    <span className={`mt-1 ${critical ? 'text-destructive' : event.status === 'success' ? 'text-success' : 'text-muted-foreground'}`}>
      {critical ? <AlertTriangle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
    </span>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warning' | 'critical' }) {
  const toneClass =
    tone === 'good' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'critical' ? 'text-destructive' : '';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`mt-1 truncate text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
