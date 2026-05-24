import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { AvailabilityAnalyticsPanel } from '@/components/analytics/AvailabilityAnalyticsPanel';
import { MovementCard } from '@/components/analytics/ProductMovementTables';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getAvailabilityAnalytics } from '@/server/analytics/get-availability-analytics';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsAvailabilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, data] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getAvailabilityAnalytics(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Availability analytics" description="Stock ratio over time, out-of-stock trends, back-in-stock events, and unstable availability." />
      <AnalyticsFilters current={params} options={options} />
      <Card><CardHeader><CardTitle>Stock status trends</CardTitle></CardHeader><CardContent><AvailabilityAnalyticsPanel data={data} /></CardContent></Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <MovementCard title="Newly unavailable products" rows={data.newlyUnavailable} tone="bad" />
        <MovementCard title="Back in stock products" rows={data.backInStock} tone="good" />
        <MovementCard title="Unstable availability products" rows={data.unstableAvailability} tone="warn" />
      </div>
    </div>
  );
}
