import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analyticsLatestProductsCte, analyticsScopeCte, bucketExpression } from './analytics-filters';
import { calculateFreshnessScore } from './analytics-metrics';
import { getCompetitorAnalytics } from './get-competitor-analytics';
import type { AnalyticsFilters, DataQualityAnalytics, ProductMovementRow } from './types';

interface SummaryRow extends Record<string, unknown> {
  missing_price_count: number;
  missing_image_count: number;
  low_confidence_products: number;
  failed_extractions: number;
  stale_products: number;
  never_successfully_scraped: number;
  fresh_products: number;
  total_products: number;
  ok_count: number;
  total_snapshots: number;
}

interface DistributionRow extends Record<string, unknown> {
  bucket: string;
  count: number;
}

interface TrendRow extends Record<string, unknown> {
  bucket: string;
  ok: number;
  failed: number;
}

interface ScrapeTrendRow extends Record<string, unknown> {
  bucket: string;
  success: number;
  failed: number;
  total: number;
}

interface QualityProductRow extends Record<string, unknown> {
  product_id: string | null;
  competitor_product_id: string;
  product_title: string;
  competitor_name: string;
  price: string | null;
  currency: string | null;
  confidence: string | null;
  snapshot_status: string | null;
  timestamp: string | null;
  quality_score: number;
}

interface CountRow extends Record<string, unknown> {
  count: number;
}

export async function getDataQuality(orgId: string, filters: AnalyticsFilters): Promise<DataQualityAnalytics> {
  const latest = analyticsLatestProductsCte('latest_products', orgId, filters);
  const scoped = analyticsScopeCte('scoped', orgId, filters);
  const bucket = bucketExpression(filters, sql`scoped.scraped_at`);
  const fromValue = filters.dateFrom?.toISOString() ?? null;
  const [summaryRows, confidenceRows, healthRows, scrapeRows, productRows, selectorRows, captchaRows, competitors] =
    await Promise.all([
      db().execute<SummaryRow>(sql`
        with ${latest}, ${scoped}
        select
          (select count(*)::int from latest_products where price is null) as missing_price_count,
          (select count(*)::int from latest_products where image_url is null) as missing_image_count,
          (select count(*)::int from latest_products where confidence < 0.7) as low_confidence_products,
          (select count(*)::int from scoped where snapshot_status <> 'ok') as failed_extractions,
          (select count(*)::int from latest_products where last_scraped_at is null or last_scraped_at < now() - interval '24 hours') as stale_products,
          (select count(*)::int from latest_products where scraped_at is null or snapshot_status is distinct from 'ok') as never_successfully_scraped,
          (select count(*)::int from latest_products where last_scraped_at >= now() - interval '24 hours') as fresh_products,
          (select count(*)::int from latest_products) as total_products,
          (select count(*)::int from scoped where snapshot_status = 'ok') as ok_count,
          (select count(*)::int from scoped) as total_snapshots
      `),
      db().execute<DistributionRow>(sql`
        with ${scoped}
        select
          case
            when confidence >= 0.9 then '90-100'
            when confidence >= 0.75 then '75-89'
            when confidence >= 0.5 then '50-74'
            else '<50'
          end as bucket,
          count(*)::int as count
        from scoped
        group by 1
        order by 1
      `),
      db().execute<TrendRow>(sql`
        with ${scoped}
        select
          ${bucket}::text as bucket,
          count(*) filter (where snapshot_status = 'ok')::int as ok,
          count(*) filter (where snapshot_status <> 'ok')::int as failed
        from scoped
        group by ${bucket}
        order by ${bucket}
      `),
      db().execute<ScrapeTrendRow>(sql`
        select
          ${filters.range === '24h' ? sql`date_trunc('hour', created_at)` : sql`date_trunc('day', created_at)`}::text as bucket,
          count(*) filter (where status in ('success','partial'))::int as success,
          count(*) filter (where status = 'failed')::int as failed,
          count(*)::int as total
        from scrape_runs
        where org_id = ${orgId}
          and (${fromValue}::timestamptz is null or created_at >= ${fromValue}::timestamptz)
        group by 1
        order by 1
      `),
      db().execute<QualityProductRow>(sql`
        with ${latest}
        select
          product_id,
          competitor_product_id,
          coalesce(product_name, title, url) as product_title,
          competitor_name,
          price::text,
          currency,
          confidence::text,
          snapshot_status,
          scraped_at::text as timestamp,
          (
            case when price is not null then 22 else 0 end +
            case when coalesce(product_name, title) is not null then 16 else 0 end +
            coalesce(confidence, 0) * 22 +
            case when last_scraped_at >= now() - interval '24 hours' then 16 else 0 end +
            case when snapshot_status = 'ok' then 16 else 0 end +
            case when url like 'http%' then 8 else 0 end
          )::int as quality_score
        from latest_products
        order by quality_score asc, scraped_at asc nulls first
        limit 40
      `),
      db().execute<CountRow>(sql`
        select count(*)::int as count
        from selector_repair_attempts
        where organization_id = ${orgId}
          and (${fromValue}::timestamptz is null or created_at >= ${fromValue}::timestamptz)
      `),
      db().execute<CountRow>(sql`
        select count(*)::int as count
        from manual_scraping_sessions
        where organization_id = ${orgId}
          and status in ('waiting_for_manual_action','browser_opened','paused')
      `),
      getCompetitorAnalytics(orgId, filters),
    ]);

  const summaryRow = summaryRows[0] ?? {
    missing_price_count: 0,
    missing_image_count: 0,
    low_confidence_products: 0,
    failed_extractions: 0,
    stale_products: 0,
    never_successfully_scraped: 0,
    fresh_products: 0,
    total_products: 0,
    ok_count: 0,
    total_snapshots: 0,
  };
  const extractionSuccessRate = Number(summaryRow.total_snapshots) > 0
    ? Math.round((Number(summaryRow.ok_count) / Number(summaryRow.total_snapshots)) * 100)
    : 0;
  const freshness = calculateFreshnessScore(Number(summaryRow.total_products), Number(summaryRow.fresh_products));

  return {
    summary: {
      missingPriceCount: Number(summaryRow.missing_price_count),
      missingImageCount: Number(summaryRow.missing_image_count),
      lowConfidenceProducts: Number(summaryRow.low_confidence_products),
      failedExtractions: Number(summaryRow.failed_extractions),
      staleProducts: Number(summaryRow.stale_products),
      selectorRepairCount: Number(selectorRows[0]?.count ?? 0),
      captchaManualSessions: Number(captchaRows[0]?.count ?? 0),
      neverSuccessfullyScraped: Number(summaryRow.never_successfully_scraped),
      extractionSuccessRate,
      dataQualityScore: Math.round((extractionSuccessRate + freshness) / 2),
    },
    confidenceDistribution: confidenceRows.map((row) => ({ bucket: row.bucket, count: Number(row.count) })),
    extractionHealthTrend: healthRows.map((row) => ({ bucket: row.bucket, ok: Number(row.ok), failed: Number(row.failed) })),
    scrapeSuccessTimeline: scrapeRows.map((row) => ({
      bucket: row.bucket,
      successRate: Number(row.total) > 0 ? Math.round((Number(row.success) / Number(row.total)) * 100) : 0,
      failed: Number(row.failed),
      total: Number(row.total),
    })),
    worstProducts: productRows.map(mapQualityProduct),
    failedExtractions: productRows.filter((row) => row.snapshot_status && row.snapshot_status !== 'ok').map(mapQualityProduct),
    problematicCompetitors: competitors.sort((a, b) => a.dataQualityScore - b.dataQualityScore).slice(0, 12),
  };
}

function mapQualityProduct(row: QualityProductRow): ProductMovementRow {
  const competitorProductId = row.competitor_product_id;
  return {
    productId: row.product_id ?? competitorProductId,
    competitorProductId,
    productTitle: row.product_title,
    competitorName: row.competitor_name,
    oldPrice: null,
    newPrice: row.price == null ? null : Number(row.price),
    currency: row.currency ?? 'EUR',
    deltaAmount: null,
    deltaPct: null,
    timestamp: row.timestamp,
    metric: Number(row.quality_score),
    href: row.product_id ? `/products/${row.product_id}` : `/competitors/products/${competitorProductId}`,
  };
}
