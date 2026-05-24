import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { CompetitorAggressivenessChart } from '@/components/analytics/CompetitorAggressivenessChart';
import { CompetitorAnalyticsTable } from '@/components/analytics/CompetitorAnalyticsTable';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getCompetitorAnalytics } from '@/server/analytics/get-competitor-analytics';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsCompetitorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, rows] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getCompetitorAnalytics(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Competitor analytics" description="Aggressiveness, discounts, stock ratio, movement comparison, failed scrapes, and data quality." />
      <AnalyticsFilters current={params} options={options} />
      <Card>
        <CardHeader><CardTitle>Competitor aggressiveness</CardTitle><CardDescription>Formula: drops, discounts, changes, stock changes, and failed scrapes normalized to 0-100.</CardDescription></CardHeader>
        <CardContent><CompetitorAggressivenessChart data={rows} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Competitor intelligence table</CardTitle></CardHeader>
        <CardContent className="p-0"><CompetitorAnalyticsTable data={rows} /></CardContent>
      </Card>
    </div>
  );
}
