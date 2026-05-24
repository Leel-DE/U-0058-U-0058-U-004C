import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsDrilldownHeader } from '@/components/analytics/AnalyticsDrilldownHeader';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { CompetitorAnalyticsTable } from '@/components/analytics/CompetitorAnalyticsTable';
import { DataQualityPanel } from '@/components/analytics/DataQualityPanel';
import { MovementCard } from '@/components/analytics/ProductMovementTables';
import { getContext } from '@/lib/auth';
import { parseAnalyticsFilters } from '@/server/analytics/analytics-filters';
import { getAnalyticsFilterOptions } from '@/server/analytics/get-analytics-filter-options';
import { getDataQuality } from '@/server/analytics/get-data-quality';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsDataQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseAnalyticsFilters(params);
  const [options, data] = await Promise.all([
    getAnalyticsFilterOptions(ctx.orgId),
    getDataQuality(ctx.orgId, filters),
  ]);
  const s = data.summary;

  return (
    <div className="space-y-6">
      <AnalyticsDrilldownHeader title="Data quality analytics" description="Extraction completeness, confidence, scraping health, stale data, selector repairs, and manual captcha sessions." />
      <AnalyticsFilters current={params} options={options} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Missing price" value={s.missingPriceCount} />
        <Metric label="Missing image" value={s.missingImageCount} />
        <Metric label="Low confidence" value={s.lowConfidenceProducts} />
        <Metric label="Failed extractions" value={s.failedExtractions} />
        <Metric label="Data quality" value={`${s.dataQualityScore}%`} />
        <Metric label="Stale products" value={s.staleProducts} />
        <Metric label="Selector repair count" value={s.selectorRepairCount} />
        <Metric label="Manual sessions" value={s.captchaManualSessions} />
        <Metric label="Never scraped OK" value={s.neverSuccessfullyScraped} />
        <Metric label="Extraction success" value={`${s.extractionSuccessRate}%`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Quality charts</CardTitle><CardDescription>Confidence distribution, extraction health trend, and scrape success rate.</CardDescription></CardHeader>
        <CardContent><DataQualityPanel data={data} /></CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <MovementCard title="Worst products by quality" rows={data.worstProducts} tone="warn" />
        <MovementCard title="Failed extractions" rows={data.failedExtractions} tone="bad" />
      </div>
      <Card>
        <CardHeader><CardTitle>Problematic competitors</CardTitle></CardHeader>
        <CardContent className="p-0"><CompetitorAnalyticsTable data={data.problematicCompetitors} /></CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></CardContent></Card>
  );
}
