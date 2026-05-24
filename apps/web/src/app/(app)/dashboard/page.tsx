import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { getContext } from '@/lib/auth';
import { formatCurrency, formatPct, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/separator';
import { parseDashboardFilters } from '@/server/dashboard/helpers';
import { getDashboardOverview } from '@/server/dashboard/get-dashboard-overview';
import { getMonitoringHealth } from '@/server/dashboard/get-monitoring-health';
import { getPriceMovements } from '@/server/dashboard/get-price-movements';
import { getCompetitorActivity } from '@/server/dashboard/get-competitor-activity';
import { getProductsRequiringAttention } from '@/server/dashboard/get-products-requiring-attention';
import { getAvailabilityOverview } from '@/server/dashboard/get-availability-overview';
import { getRecentEvents } from '@/server/dashboard/get-recent-events';
import { getDataFreshness } from '@/server/dashboard/get-data-freshness';
import { getDashboardFilterOptions } from '@/server/dashboard/get-dashboard-filter-options';
import type {
  AttentionProduct,
  AvailabilityOverview,
  CompetitorActivityRow,
  DashboardKpi,
  DataFreshness,
  MonitoringHealth,
  PriceMovementRow,
  PriceMovements,
  RecentEvent,
} from '@/server/dashboard/types';
import {
  AvailabilityDistributionChart,
  CompetitorActivityChart,
  PriceMovementTimeline,
} from './_components/dashboard-charts';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);

  const [
    overview,
    health,
    movements,
    competitorActivity,
    attention,
    availability,
    events,
    freshness,
    filterOptions,
  ] = await Promise.all([
    safeLoad('overview', () => getDashboardOverview(ctx.orgId, filters), [] as DashboardKpi[]),
    safeLoad('health', () => getMonitoringHealth(ctx.orgId, filters), null),
    safeLoad('movements', () => getPriceMovements(ctx.orgId, filters), null),
    safeLoad('competitor activity', () => getCompetitorActivity(ctx.orgId, filters), [] as CompetitorActivityRow[]),
    safeLoad('attention', () => getProductsRequiringAttention(ctx.orgId, filters), [] as AttentionProduct[]),
    safeLoad('availability', () => getAvailabilityOverview(ctx.orgId, filters), null),
    safeLoad('events', () => getRecentEvents(ctx.orgId, filters), [] as RecentEvent[]),
    safeLoad('freshness', () => getDataFreshness(ctx.orgId, filters), null),
    safeLoad('filters', () => getDashboardFilterOptions(ctx.orgId), { competitors: [], categories: [] }),
  ]);

  const totalProducts = overview.find((kpi) => kpi.label === 'Total monitored products')?.numericValue ?? 0;
  const totalCompetitors = overview.find((kpi) => kpi.label === 'Total competitors')?.numericValue ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Operational overview of competitor changes, scraping health, and products that need attention.
          </p>
        </div>
        <QuickActions />
      </header>

      <DashboardFilters current={params} competitors={filterOptions.competitors} categories={filterOptions.categories} />

      {totalProducts === 0 && totalCompetitors === 0 ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="Add your first competitor"
          description="Run site discovery or add products manually to populate price movements, health metrics, and alerts."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild><Link href="/competitors">Add competitor</Link></Button>
              <Button asChild variant="outline"><Link href="/products">Add product manually</Link></Button>
            </div>
          }
        />
      ) : (
        <>
          <KpiGrid data={overview} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            {movements ? <PriceMovementOverview data={movements} /> : <WidgetError title="Price movement overview" />}
            {health ? <MonitoringHealthPanel data={health} /> : <WidgetError title="Monitoring health" />}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CompetitorActivityPanel data={competitorActivity} />
            {availability ? <AvailabilityPanel data={availability} /> : <WidgetError title="Availability overview" />}
          </div>

          <ProductsAttentionTable data={attention} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <RecentEventsFeed data={events} />
            {freshness ? <DataFreshnessPanel data={freshness} /> : <WidgetError title="Data freshness" />}
          </div>
        </>
      )}
    </div>
  );
}

async function safeLoad<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Dashboard widget failed: ${name}`, error);
    return fallback;
  }
}

function DashboardFilters({
  current,
  competitors,
  categories,
}: {
  current: SearchParams;
  competitors: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const range = fieldValue(current.range) ?? 'today';
  const competitor = fieldValue(current.competitor) ?? 'all';
  const category = fieldValue(current.category) ?? 'all';
  const activeOnly = fieldValue(current.activeOnly) !== 'false';
  const failedOnly = fieldValue(current.failedOnly) === 'true';
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-[160px_240px_220px_170px_170px_1fr]">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase text-muted-foreground">Date range</span>
          <select name="range" form="dashboard-filter-form" defaultValue={range} className="h-10 w-full rounded-md border bg-background px-3">
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase text-muted-foreground">Competitor</span>
          <select name="competitor" form="dashboard-filter-form" defaultValue={competitor} className="h-10 w-full rounded-md border bg-background px-3">
            <option value="all">All competitors</option>
            {competitors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase text-muted-foreground">Category</span>
          <select name="category" form="dashboard-filter-form" defaultValue={category} className="h-10 w-full rounded-md border bg-background px-3">
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase text-muted-foreground">Competitor status</span>
          <select name="activeOnly" form="dashboard-filter-form" defaultValue={activeOnly ? 'true' : 'false'} className="h-10 w-full rounded-md border bg-background px-3">
            <option value="true">Only active</option>
            <option value="false">All statuses</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase text-muted-foreground">Issue focus</span>
          <select name="failedOnly" form="dashboard-filter-form" defaultValue={failedOnly ? 'true' : 'false'} className="h-10 w-full rounded-md border bg-background px-3">
            <option value="false">All data</option>
            <option value="true">Failed/stale only</option>
          </select>
        </label>
        <form id="dashboard-filter-form" className="flex items-end justify-end gap-2" action="/dashboard">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="outline"><Link href="/dashboard">Reset</Link></Button>
        </form>
      </CardContent>
    </Card>
  );
}

function KpiGrid({ data }: { data: DashboardKpi[] }) {
  if (data.length === 0) return <WidgetError title="KPI cards" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {data.map((card) => {
        const body = (
          <Card className="h-full transition-colors hover:bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">{card.label}</div>
                <StatusDot status={card.status} />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {card.delta == null ? 'No comparison' : `${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)}% vs previous period`}
              </div>
            </CardContent>
          </Card>
        );
        return card.href ? <Link key={card.label} href={card.href}>{body}</Link> : <div key={card.label}>{body}</div>;
      })}
    </div>
  );
}

function MonitoringHealthPanel({ data }: { data: MonitoringHealth }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Monitoring health</CardTitle>
          <Badge variant={data.status === 'healthy' ? 'success' : data.status === 'warning' ? 'warning' : 'destructive'}>{data.status}</Badge>
        </div>
        <CardDescription>Scraping stability and operational blockers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Success rate" value={`${data.scrapingSuccessRate}%`} />
          <Metric label="Failed runs 24h" value={data.failedRuns24h.toLocaleString()} />
          <Metric label="Avg crawl duration" value={formatDuration(data.averageCrawlDurationMs)} />
          <Metric label="Broken selectors" value={data.brokenSelectorsCount.toLocaleString()} />
          <Metric label="Manual sessions" value={data.manualSessionsCount.toLocaleString()} />
          <Metric label="Stale products" value={data.staleProductsCount.toLocaleString()} />
        </div>
        <Separator />
        <div className="text-sm text-muted-foreground">Last worker heartbeat: {timeAgo(data.lastWorkerHeartbeat)}</div>
        <ul className="space-y-1 text-sm">
          {data.reasons.map((reason) => <li key={reason}>- {reason}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

function PriceMovementOverview({ data }: { data: PriceMovements }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Price movement overview</CardTitle>
        <CardDescription>Drops and increases captured in the selected period.</CardDescription>
      </CardHeader>
      <CardContent>
        <PriceMovementTimeline data={data.timeline} />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MovementTable title="Top price drops" rows={data.drops} direction="down" />
          <MovementTable title="Top price increases" rows={data.increases} direction="up" />
        </div>
      </CardContent>
    </Card>
  );
}

function MovementTable({ title, rows, direction }: { title: string; rows: PriceMovementRow[]; direction: 'up' | 'down' }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No rows.</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(0, 5).map((row) => (
              <tr key={`${row.productId}-${row.capturedAt}`} className="border-t">
                <td className="py-2 pr-2">
                  <Link className="font-medium hover:underline" href={`/competitors/products/${row.productId}`}>{row.productTitle}</Link>
                  <div className="text-xs text-muted-foreground">{row.competitorName}</div>
                </td>
                <td className="py-2 text-right tabular-nums">
                  <div>{formatCurrency(row.newPrice, row.currency)}</div>
                  <div className={direction === 'down' ? 'text-success' : 'text-destructive'}>{formatPct(row.deltaPct)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompetitorActivityPanel({ data }: { data: CompetitorActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor activity</CardTitle>
        <CardDescription>Most active competitors by price and stock changes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CompetitorActivityChart data={data} />
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Competitor</th><th>Products</th><th>Changes</th><th>Failed</th><th>Last crawl</th></tr>
          </thead>
          <tbody>
            {data.slice(0, 8).map((row) => (
              <tr key={row.competitorId} className="border-t">
                <td className="py-2 font-medium">{row.competitorName}</td>
                <td className="tabular-nums">{row.productsMonitored}</td>
                <td className="tabular-nums">{row.changesToday}</td>
                <td className="tabular-nums">{row.failedRuns}</td>
                <td>{timeAgo(row.lastCrawl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AvailabilityPanel({ data }: { data: AvailabilityOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Availability overview</CardTitle>
        <CardDescription>Current stock distribution and stock changes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="In stock" value={data.inStock.toLocaleString()} />
          <Metric label="Out of stock" value={data.outOfStock.toLocaleString()} />
          <Metric label="Unknown" value={data.unknown.toLocaleString()} />
        </div>
        <AvailabilityDistributionChart data={data} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Back in stock today" value={data.backInStockToday.toLocaleString()} />
          <Metric label="Newly unavailable today" value={data.newlyUnavailableToday.toLocaleString()} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsAttentionTable({ data }: { data: AttentionProduct[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Products requiring attention</CardTitle>
        <CardDescription>Operational issues from latest snapshots, stale data, selectors, and stock changes.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {data.length === 0 ? (
          <div className="p-6"><EmptyState title="No attention items" description="No high-priority product issues in this filter." /></div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Product</th><th className="px-4 py-2">Issue</th><th className="px-4 py-2">Price</th><th className="px-4 py-2">Previous</th><th className="px-4 py-2">Availability</th><th className="px-4 py-2">Confidence</th><th className="px-4 py-2">Last checked</th><th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={`${row.productId}-${row.issueType}`} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{row.productTitle}</div>
                    <div className="text-xs text-muted-foreground">{row.competitorName}</div>
                  </td>
                  <td className="px-4 py-2"><IssueBadge issue={row.issueType} /></td>
                  <td className="px-4 py-2 tabular-nums">{formatCurrency(row.currentPrice, row.currency)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatCurrency(row.previousPrice, row.currency)}</td>
                  <td className="px-4 py-2">{row.availability ?? 'unknown'}</td>
                  <td className="px-4 py-2 tabular-nums">{row.confidence == null ? '-' : `${Math.round(row.confidence * 100)}%`}</td>
                  <td className="px-4 py-2">{timeAgo(row.lastChecked)}</td>
                  <td className="px-4 py-2"><Button asChild size="sm" variant="outline"><Link href={row.href}>Open</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function RecentEventsFeed({ data }: { data: RecentEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent events</CardTitle>
        <CardDescription>Latest price, discovery, scrape, alert, captcha, and export events.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <EmptyState title="No recent events" description="Events will appear as monitoring runs." /> : (
          <div className="space-y-3">
            {data.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-md border p-3">
                <EventIcon type={event.type} status={event.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate font-medium">{event.entity}</div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(event.timestamp)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{event.type.replace(/_/g, ' ')}</div>
                </div>
                {event.href ? <Link href={event.href}><ExternalLink className="h-4 w-4 text-muted-foreground" /></Link> : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataFreshnessPanel({ data }: { data: DataFreshness }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data freshness</CardTitle>
        <CardDescription>How recently monitored products were checked.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm"><span>Fresh &lt; 24h</span><span>{data.freshPct}%</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${data.freshPct}%` }} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Fresh" value={data.fresh.toLocaleString()} />
          <Metric label="Stale >24h" value={data.stale.toLocaleString()} />
          <Metric label="Very stale >7d" value={data.veryStale.toLocaleString()} />
          <Metric label="Never checked" value={data.neverChecked.toLocaleString()} />
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm"><Link href="/competitors"><Plus className="mr-2 h-4 w-4" />Add competitor</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/competitors">Start discovery</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/jobs"><RefreshCw className="mr-2 h-4 w-4" />Run scrape now</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/jobs?status=failed">View failed jobs</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/exports">Export latest report</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/alerts">Open alerts</Link></Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function WidgetError({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><EmptyState title="Widget unavailable" description="This section failed to load; other dashboard widgets are still available." /></CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: DashboardKpi['status'] }) {
  const cls = status === 'good' ? 'bg-success' : status === 'warning' ? 'bg-warning' : status === 'critical' ? 'bg-destructive' : 'bg-muted-foreground';
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function IssueBadge({ issue }: { issue: AttentionProduct['issueType'] }) {
  const critical = issue === 'captcha_required' || issue === 'selector_broken' || issue === 'extraction_failed' || issue === 'missing_price';
  return <Badge variant={critical ? 'destructive' : issue === 'stale_data' ? 'warning' : 'secondary'}>{issue.replace(/_/g, ' ')}</Badge>;
}

function EventIcon({ type, status }: { type: RecentEvent['type']; status: RecentEvent['status'] }) {
  const className = status === 'critical' ? 'text-destructive' : status === 'warning' ? 'text-warning' : status === 'success' ? 'text-success' : 'text-muted-foreground';
  const icon = type === 'price_changed' ? <Activity /> : type === 'alert_triggered' || type === 'captcha_required' || type === 'scrape_failed' ? <AlertTriangle /> : type === 'export_completed' ? <CheckCircle2 /> : <Clock />;
  return <span className={`mt-0.5 [&>svg]:h-4 [&>svg]:w-4 ${className}`}>{icon}</span>;
}

function fieldValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDuration(ms: number) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
