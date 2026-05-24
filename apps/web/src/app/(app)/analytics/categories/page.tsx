import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { CategoryAnalyticsTable } from '@/components/analytics/CategoryAnalyticsTable';
import { CategoryVolatilityChart } from '@/components/analytics/CategoryVolatilityChart';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getCategoryAnalytics } from '@/server/analytics/get-category-analytics';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, rows] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getCategoryAnalytics(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Category analytics" description="Category price levels, stock ratios, discounts, volatility, and trend." />
      <AnalyticsFilters current={params} options={options} />
      <Card>
        <CardHeader><CardTitle>Category volatility and stock</CardTitle><CardDescription>Volatility formula: price range percent and price-change count, clamped to 0-100.</CardDescription></CardHeader>
        <CardContent><CategoryVolatilityChart data={rows} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Category intelligence table</CardTitle></CardHeader>
        <CardContent className="p-0"><CategoryAnalyticsTable data={rows} /></CardContent>
      </Card>
    </div>
  );
}
