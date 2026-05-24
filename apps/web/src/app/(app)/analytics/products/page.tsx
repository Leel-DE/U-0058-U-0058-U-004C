import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { ProductMovementTables } from '@/components/analytics/ProductMovementTables';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getProductMovements } from '@/server/analytics/get-product-movements';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, movements] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getProductMovements(ctx.orgId, filters),
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Product movement analytics" description="Price drops, increases, volatility, discounts, frequent changes, missing prices, and stale data." />
      <AnalyticsFilters current={params} options={options} />
      <ProductMovementTables data={movements} />
    </div>
  );
}
