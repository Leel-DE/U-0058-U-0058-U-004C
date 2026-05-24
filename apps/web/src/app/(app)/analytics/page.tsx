import Link from 'next/link';
import { Activity, Database, PackageSearch } from 'lucide-react';
import { getContext } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { AnalyticsKpiGrid } from '@/components/analytics/AnalyticsKpiGrid';
import { AvailabilityAnalyticsPanel } from '@/components/analytics/AvailabilityAnalyticsPanel';
import { CategoryAnalyticsTable } from '@/components/analytics/CategoryAnalyticsTable';
import { CategoryVolatilityChart } from '@/components/analytics/CategoryVolatilityChart';
import { CompetitorAggressivenessChart } from '@/components/analytics/CompetitorAggressivenessChart';
import { CompetitorAnalyticsTable } from '@/components/analytics/CompetitorAnalyticsTable';
import { DataQualityPanel } from '@/components/analytics/DataQualityPanel';
import { MarketInsightsCards } from '@/components/analytics/MarketInsightsCards';
import { DiscountActivityChart, MarketTrendChart, PriceChangesChart } from '@/components/analytics/MarketTrendChart';
import { PriceBandChart } from '@/components/analytics/PriceBandChart';
import { ProductMovementTables } from '@/components/analytics/ProductMovementTables';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getAnalyticsOverview } from '@/server/analytics/get-analytics-overview';
import { getAvailabilityAnalytics } from '@/server/analytics/get-availability-analytics';
import { getCategoryAnalytics } from '@/server/analytics/get-category-analytics';
import { getCompetitorAnalytics } from '@/server/analytics/get-competitor-analytics';
import { getDataQuality } from '@/server/analytics/get-data-quality';
import { getMarketInsights } from '@/server/analytics/get-market-insights';
import { getMarketTrends } from '@/server/analytics/get-market-trends';
import { getProductMovements } from '@/server/analytics/get-product-movements';
import type {
  AnalyticsKpi,
  AvailabilityAnalytics,
  CategoryAnalyticsRow,
  CompetitorAnalyticsRow,
  DataQualityAnalytics,
  MarketInsight,
  MarketTrendPoint,
  ProductMovements,
} from '@/server/analytics/types';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, overview, trends, competitors, categories, movements, availability, quality, insights] = await Promise.all([
    safeLoad('filters', () => getAnalyticsFilterOptions(ctx.orgId), { competitors: [], categories: [], brands: [] }),
    safeLoad('overview', () => getAnalyticsOverview(ctx.orgId, filters), [] as AnalyticsKpi[]),
    safeLoad('market trends', () => getMarketTrends(ctx.orgId, filters), [] as MarketTrendPoint[]),
    safeLoad('competitors', () => getCompetitorAnalytics(ctx.orgId, filters), [] as CompetitorAnalyticsRow[]),
    safeLoad('categories', () => getCategoryAnalytics(ctx.orgId, filters), [] as CategoryAnalyticsRow[]),
    safeLoad('movements', () => getProductMovements(ctx.orgId, filters), emptyMovements()),
    safeLoad('availability', () => getAvailabilityAnalytics(ctx.orgId, filters), null as AvailabilityAnalytics | null),
    safeLoad('quality', () => getDataQuality(ctx.orgId, filters), null as DataQualityAnalytics | null),
    safeLoad('insights', () => getMarketInsights(ctx.orgId, filters), [] as MarketInsight[]),
  ]);

  const totalProducts = overview.find((item) => item.label === 'Total analyzed products')?.numericValue ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics Center</h1>
          <p className="text-sm text-muted-foreground">
            Market intelligence across products, competitors, categories, availability, scraping health, and historical snapshots.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/analytics/market">Market</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/analytics/competitors">Competitors</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/analytics/products">Products</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/analytics/data-quality">Data quality</Link></Button>
        </div>
      </header>

      <AnalyticsFilters current={params} options={options} />

      {totalProducts === 0 ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="No analytics data yet"
          description="Add a competitor, run site discovery, then scrape products to populate market analytics."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild><Link href="/competitors">Add competitor</Link></Button>
              <Button asChild variant="outline"><Link href="/competitors">Run discovery</Link></Button>
            </div>
          }
        />
      ) : (
        <>
          <AnalyticsKpiGrid data={overview} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <Card>
              <CardHeader><CardTitle>Market price trends</CardTitle><CardDescription>Average and median market prices for the selected period.</CardDescription></CardHeader>
              <CardContent><MarketTrendChart data={trends} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Market insights</CardTitle><CardDescription>Rule-based intelligence from current filters.</CardDescription></CardHeader>
              <CardContent><MarketInsightsCards data={insights.slice(0, 6)} /></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Min / max / avg price band</CardTitle></CardHeader>
              <CardContent><PriceBandChart data={trends} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Discount and movement activity</CardTitle></CardHeader>
              <CardContent className="grid gap-4"><DiscountActivityChart data={trends} /><PriceChangesChart data={trends} /></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Competitor analytics</CardTitle><CardDescription>Aggressiveness, discounts, stock ratio, movement, and quality.</CardDescription></CardHeader>
            <CardContent className="space-y-4"><CompetitorAggressivenessChart data={competitors} /><CompetitorAnalyticsTable data={competitors.slice(0, 12)} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Category analytics</CardTitle><CardDescription>Category volatility, price ranges, discounts, and trend.</CardDescription></CardHeader>
            <CardContent className="space-y-4"><CategoryVolatilityChart data={categories} /><CategoryAnalyticsTable data={categories.slice(0, 12)} /></CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex items-center gap-2"><PackageSearch className="h-5 w-5 text-muted-foreground" /><h2 className="text-lg font-semibold">Product movement analytics</h2></div>
            <ProductMovementTables data={movements} />
          </section>

          {availability ? (
            <Card>
              <CardHeader><CardTitle>Availability analytics</CardTitle></CardHeader>
              <CardContent><AvailabilityAnalyticsPanel data={availability} /></CardContent>
            </Card>
          ) : <WidgetError title="Availability analytics" />}

          {quality ? (
            <Card>
              <CardHeader><CardTitle>Data quality analytics</CardTitle><CardDescription>Extraction confidence, scrape success, stale products, and missing data.</CardDescription></CardHeader>
              <CardContent><DataQualityPanel data={quality} /></CardContent>
            </Card>
          ) : <WidgetError title="Data quality analytics" />}
        </>
      )}
    </div>
  );
}

async function safeLoad<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Analytics widget failed: ${name}`, error);
    return fallback;
  }
}

function WidgetError({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4" />Widget unavailable for selected filters.</CardContent>
    </Card>
  );
}

function emptyMovements(): ProductMovements {
  return {
    biggestDrops: [],
    biggestIncreases: [],
    mostVolatile: [],
    mostDiscounted: [],
    mostFrequentlyChanging: [],
    missingPrices: [],
    staleProducts: [],
  };
}
