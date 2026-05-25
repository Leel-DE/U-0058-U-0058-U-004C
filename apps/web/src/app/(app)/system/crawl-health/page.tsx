import { sql } from 'drizzle-orm';
import { Activity, AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { getContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface SummaryRow extends Record<string, unknown> {
  total_snapshots: number;
  ok_snapshots: number;
  failed_snapshots: number;
  captcha_snapshots: number;
  low_confidence_snapshots: number;
  avg_duration_ms: number | null;
  stale_products: number;
  failed_runs: number;
}

interface DomainRow extends Record<string, unknown> {
  domain: string;
  success_rate: string | null;
  avg_response_ms: number | null;
  captcha_rate: string | null;
  retry_count: number;
  failure_count: number;
  recommended_strategy: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
}

function pct(value: string | number | null | undefined) {
  if (value == null) return 'n/a';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}

function StatCard({
  title,
  value,
  icon: Icon,
  tone = 'secondary',
}: {
  title: string;
  value: string | number;
  icon: typeof Activity;
  tone?: 'secondary' | 'success' | 'warning' | 'destructive';
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Badge variant={tone}>
          <Icon className="h-3.5 w-3.5" />
        </Badge>
      </CardContent>
    </Card>
  );
}

export default async function CrawlHealthPage() {
  const ctx = await getContext();
  const [summary] = await db().execute<SummaryRow>(sql`
    select
      count(ps.id)::int as total_snapshots,
      count(ps.id) filter (where ps.status = 'ok')::int as ok_snapshots,
      count(ps.id) filter (where ps.status <> 'ok')::int as failed_snapshots,
      count(ps.id) filter (where ps.status = 'captcha')::int as captcha_snapshots,
      count(ps.id) filter (where ps.confidence < 0.70)::int as low_confidence_snapshots,
      avg(ps.duration_ms)::int as avg_duration_ms,
      (
        select count(*)::int
        from competitor_products cp
        where cp.org_id = ${ctx.orgId}
          and cp.active = true
          and (cp.last_scraped_at is null or cp.last_scraped_at < now() - interval '48 hours')
      ) as stale_products,
      (
        select count(*)::int
        from scrape_runs sr
        where sr.org_id = ${ctx.orgId}
          and sr.status = 'failed'
          and sr.created_at >= now() - interval '24 hours'
      ) as failed_runs
    from price_snapshots ps
    where ps.org_id = ${ctx.orgId}
      and ps.scraped_at >= now() - interval '24 hours'
  `);

  const domains = await db().execute<DomainRow>(sql`
    select
      domain,
      success_rate,
      avg_response_ms,
      captcha_rate,
      retry_count,
      failure_count,
      recommended_strategy,
      last_success_at::text,
      last_failure_at::text
    from crawl_domain_health
    where organization_id = ${ctx.orgId}
    order by updated_at desc
    limit 100
  `);

  const successRate =
    summary && summary.total_snapshots > 0 ? summary.ok_snapshots / summary.total_snapshots : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Crawl health</h1>
        <p className="text-sm text-muted-foreground">Scrape reliability, confidence, retries, and domain status.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="24h success rate" value={pct(successRate)} icon={CheckCircle2} tone="success" />
        <StatCard title="Failed snapshots" value={summary?.failed_snapshots ?? 0} icon={AlertTriangle} tone="warning" />
        <StatCard title="Captcha events" value={summary?.captcha_snapshots ?? 0} icon={ShieldAlert} tone="destructive" />
        <StatCard title="Avg duration" value={`${summary?.avg_duration_ms ?? 0}ms`} icon={Clock} />
        <StatCard title="Stale products" value={summary?.stale_products ?? 0} icon={Activity} tone="warning" />
        <StatCard title="Low confidence" value={summary?.low_confidence_snapshots ?? 0} icon={Activity} tone="warning" />
        <StatCard title="Failed runs" value={summary?.failed_runs ?? 0} icon={AlertTriangle} tone="destructive" />
        <StatCard title="Snapshots 24h" value={summary?.total_snapshots ?? 0} icon={Activity} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domain health</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Domain</th>
                <th className="px-4 py-2">Success</th>
                <th className="px-4 py-2">Avg response</th>
                <th className="px-4 py-2">Captcha</th>
                <th className="px-4 py-2">Retries</th>
                <th className="px-4 py-2">Failures</th>
                <th className="px-4 py-2">Strategy</th>
                <th className="px-4 py-2">Last success</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                    No domain health rows yet. They will appear after scrape runs record outcomes.
                  </td>
                </tr>
              ) : (
                domains.map((domain) => (
                  <tr key={domain.domain} className="border-t">
                    <td className="px-4 py-2 font-medium">{domain.domain}</td>
                    <td className="px-4 py-2">{pct(domain.success_rate)}</td>
                    <td className="px-4 py-2">{domain.avg_response_ms ?? 'n/a'}ms</td>
                    <td className="px-4 py-2">{pct(domain.captcha_rate)}</td>
                    <td className="px-4 py-2">{domain.retry_count}</td>
                    <td className="px-4 py-2">{domain.failure_count}</td>
                    <td className="px-4 py-2">{domain.recommended_strategy ?? 'auto'}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {domain.last_success_at ? new Date(domain.last_success_at).toLocaleString() : 'never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
