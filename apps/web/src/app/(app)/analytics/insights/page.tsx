import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { MarketInsightsCards } from '@/components/analytics/MarketInsightsCards';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getMarketInsights } from '@/server/analytics/get-market-insights';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsInsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, insights] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getMarketInsights(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Market insights" description="Rule-based insights for price trends, stock instability, discount spikes, stale monitoring, and aggressive competitors." />
      <AnalyticsFilters current={params} options={options} />
      <MarketInsightsCards data={insights} />
    </div>
  );
}
