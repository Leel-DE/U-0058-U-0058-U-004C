import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { DiscountActivityChart, MarketTrendChart, PriceChangesChart } from '@/components/analytics/MarketTrendChart';
import { PriceBandChart } from '@/components/analytics/PriceBandChart';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getMarketTrends } from '@/server/analytics/get-market-trends';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsMarketPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, trends] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getMarketTrends(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Market analytics" description="Average, median, min, max, discount activity, and price movement trends." />
      <AnalyticsFilters current={params} options={options} />
      <Card>
        <CardHeader><CardTitle>Average and median market price</CardTitle><CardDescription>Brush to zoom into dense periods.</CardDescription></CardHeader>
        <CardContent><MarketTrendChart data={trends} /></CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Min / max / avg price band</CardTitle></CardHeader><CardContent><PriceBandChart data={trends} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Discount activity</CardTitle></CardHeader><CardContent><DiscountActivityChart data={trends} /></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Price changes count</CardTitle></CardHeader><CardContent><PriceChangesChart data={trends} /></CardContent></Card>
      </div>
    </div>
  );
}
