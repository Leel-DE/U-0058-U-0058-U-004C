import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Activity, AlertTriangle, ExternalLink, GitCompare, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getContext } from '@/lib/auth';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import { getProductDetail } from '@/server/products/queries';
import type { ProductDetail, ProductEvent } from '@/server/products/types';
import {
  AvailabilityTimeline,
  CheapestRotationChart,
  CompetitorActivityHeatmap,
  DiscountTimeline,
  ProductPriceTimeline,
  ProductSpreadChart,
} from '../_components/product-charts';

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
      <CompetitorComparison product={product} />
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
          <Badge variant={product.entityType === 'normalized' ? 'success' : 'secondary'}>{product.entityType === 'normalized' ? 'normalized product' : 'raw competitor product'}</Badge>
          <Badge variant="outline">{Math.round(product.confidence * 100)}% confidence</Badge>
        </div>
        <h1 className="max-w-5xl text-2xl font-semibold tracking-tight">{product.canonicalTitle}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{product.brand ?? 'Unknown brand'}</span>
          <span>{product.category ?? 'Uncategorized'}</span>
          <span>{product.competitorsCount} competitors</span>
          <span>updated {timeAgo(product.lastUpdated)}</span>
        </div>
        {specs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {specs.map((spec) => <Badge key={String(spec)} variant="outline">{spec}</Badge>)}
          </div>
        ) : null}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <Button asChild variant="outline"><Link href={`/products/compare?ids=${product.id}`}><GitCompare className="mr-2 h-4 w-4" />Open compare</Link></Button>
          <Button asChild variant="outline"><Link href="/matches">Manual match</Link></Button>
          <Button asChild variant="outline"><Link href="/exports">Export intelligence</Link></Button>
        </CardContent>
      </Card>
    </header>
  );
}

function MarketOverview({ product }: { product: ProductDetail }) {
  const currency = product.overview.currency;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Cheapest competitor" value={product.overview.cheapestCompetitor ?? 'none'} />
      <Metric label="Highest price" value={formatCurrency(product.overview.highestPrice, currency)} />
      <Metric label="Average price" value={formatCurrency(product.overview.averagePrice, currency)} />
      <Metric label="Current discount" value={formatPct(product.overview.currentDiscountPct)} />
      <Metric label="Stock ratio" value={`${Math.round(product.overview.stockRatio * 100)}%`} />
      <Metric label="Volatility score" value={formatPct(product.overview.volatilityScore)} />
      <Metric label="Market trend" value={product.overview.marketTrend} />
      <Metric label="Competitor spread" value={formatCurrency(product.overview.competitorSpread, currency)} />
    </div>
  );
}

function CompetitorComparison({ product }: { product: ProductDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor comparison</CardTitle>
        <CardDescription>Current live market position for each linked competitor product.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-y bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Competitor</th>
              <th className="px-4 py-2">Current price</th>
              <th className="px-4 py-2">Old price</th>
              <th className="px-4 py-2">Discount</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2">Shipping</th>
              <th className="px-4 py-2">Last update</th>
              <th className="px-4 py-2">Confidence</th>
              <th className="px-4 py-2">URL</th>
            </tr>
          </thead>
          <tbody>
            {product.competitors.map((row) => (
              <tr key={row.competitorProductId} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/competitors/products/${row.competitorProductId}`} className="font-medium hover:underline">{row.competitorName}</Link>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{row.title}</div>
                </td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(row.currentPrice, row.currency)}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(row.oldPrice, row.currency)}</td>
                <td className="px-4 py-3">{row.discountPct == null ? '-' : <Badge variant="warning">{formatPct(row.discountPct)}</Badge>}</td>
                <td className="px-4 py-3">{row.availability ?? 'unknown'}</td>
                <td className="px-4 py-3">{row.shipping ?? '-'}</td>
                <td className="px-4 py-3 text-muted-foreground">{timeAgo(row.lastUpdate)}</td>
                <td className="px-4 py-3 tabular-nums">{row.confidence == null ? '-' : `${Math.round(row.confidence * 100)}%`}</td>
                <td className="px-4 py-3"><a href={row.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function HistoricalCharts({ product }: { product: ProductDetail }) {
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
                  <div className="text-xs text-muted-foreground">{event.type.replace(/_/g, ' ')} - {timeAgo(event.timestamp)}</div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
