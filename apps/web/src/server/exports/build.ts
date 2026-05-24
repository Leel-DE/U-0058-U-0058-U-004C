/**
 * Build CSV / XLSX bytes for a given export kind. Uploads to Supabase Storage
 * under {orgId}/{exportId}.{ext} and returns the storage key.
 */
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { stringify as csvStringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { db, schema } from '@/lib/db';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type ExportKind =
  | 'snapshots_csv'
  | 'products_csv'
  | 'matches_csv'
  | 'analytics_xlsx'
  | 'product_intelligence_csv'
  | 'product_intelligence_json'
  | 'product_history_csv';

interface BuildInput {
  orgId: string;
  kind: ExportKind;
  params: Record<string, unknown>;
}

interface BuildResult {
  storageKey: string;
  rowCount: number;
  contentType: string;
}

export async function buildExport(input: BuildInput, exportId: string): Promise<BuildResult> {
  const { orgId, kind } = input;
  let body: Uint8Array;
  let contentType: string;
  let extension: string;
  let rowCount = 0;

  if (kind === 'snapshots_csv') {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await db()
      .select({
        scrapedAt: schema.priceSnapshots.scrapedAt,
        title: schema.competitorProducts.title,
        store: schema.stores.name,
        price: schema.priceSnapshots.price,
        currency: schema.priceSnapshots.currency,
        availability: schema.priceSnapshots.availability,
        source: schema.priceSnapshots.source,
      })
      .from(schema.priceSnapshots)
      .innerJoin(
        schema.competitorProducts,
        eq(schema.competitorProducts.id, schema.priceSnapshots.competitorProductId),
      )
      .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
      .where(and(eq(schema.priceSnapshots.orgId, orgId), gte(schema.priceSnapshots.scrapedAt, since)))
      .orderBy(desc(schema.priceSnapshots.scrapedAt))
      .limit(50_000);
    rowCount = rows.length;
    const csv = csvStringify(rows, { header: true });
    body = new TextEncoder().encode(csv);
    contentType = 'text/csv; charset=utf-8';
    extension = 'csv';
  } else if (kind === 'products_csv') {
    const rows = await db()
      .select({
        sku: schema.myProducts.sku,
        gtin: schema.myProducts.gtin,
        brand: schema.myProducts.brand,
        name: schema.myProducts.name,
        myPrice: schema.myProducts.myPrice,
        currency: schema.myProducts.currency,
      })
      .from(schema.myProducts)
      .where(eq(schema.myProducts.orgId, orgId))
      .limit(50_000);
    rowCount = rows.length;
    body = new TextEncoder().encode(csvStringify(rows, { header: true }));
    contentType = 'text/csv; charset=utf-8';
    extension = 'csv';
  } else if (kind === 'matches_csv') {
    const rows = await db()
      .select({
        myName: schema.myProducts.name,
        mySku: schema.myProducts.sku,
        compTitle: schema.competitorProducts.title,
        store: schema.stores.name,
        method: schema.productMatches.method,
        confidence: schema.productMatches.confidence,
        status: schema.productMatches.status,
      })
      .from(schema.productMatches)
      .innerJoin(schema.myProducts, eq(schema.productMatches.myProductId, schema.myProducts.id))
      .innerJoin(
        schema.competitorProducts,
        eq(schema.productMatches.competitorProductId, schema.competitorProducts.id),
      )
      .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
      .where(eq(schema.productMatches.orgId, orgId))
      .limit(50_000);
    rowCount = rows.length;
    body = new TextEncoder().encode(csvStringify(rows, { header: true }));
    contentType = 'text/csv; charset=utf-8';
    extension = 'csv';
  } else if (kind === 'product_intelligence_csv' || kind === 'product_intelligence_json') {
    const rows = await productIntelligenceRows(orgId);
    rowCount = rows.length;
    if (kind === 'product_intelligence_json') {
      body = new TextEncoder().encode(JSON.stringify(rows, null, 2));
      contentType = 'application/json; charset=utf-8';
      extension = 'json';
    } else {
      body = new TextEncoder().encode(csvStringify(rows, { header: true }));
      contentType = 'text/csv; charset=utf-8';
      extension = 'csv';
    }
  } else if (kind === 'product_history_csv') {
    const since = new Date(Date.now() - 180 * 86_400_000);
    const rows = await db().execute<ProductHistoryExportRow>(sql`
      select
        coalesce(mp.name, cp.title, cp.url) as canonical_title,
        st.name as competitor,
        ps.scraped_at::text as scraped_at,
        ps.price::text as price,
        ps.old_price::text as old_price,
        ps.currency,
        ps.availability::text as availability,
        ps.confidence::text as confidence,
        ps.source::text as source
      from price_snapshots ps
      join competitor_products cp on cp.id = ps.competitor_product_id
      join stores st on st.id = cp.store_id
      left join product_matches pm on pm.competitor_product_id = cp.id and pm.status = 'confirmed'
      left join my_products mp on mp.id = pm.my_product_id
      where ps.org_id = ${orgId}
        and ps.scraped_at >= ${since}
      order by ps.scraped_at desc
      limit 100000
    `);
    rowCount = rows.length;
    body = new TextEncoder().encode(csvStringify(rows, { header: true }));
    contentType = 'text/csv; charset=utf-8';
    extension = 'csv';
  } else {
    // analytics_xlsx — one sheet per slice
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Competitor Radar';
    wb.created = new Date();

    const summary = wb.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 16 },
    ];
    const totals = await db()
      .select({
        products: schema.competitorProducts.id,
      })
      .from(schema.competitorProducts)
      .where(eq(schema.competitorProducts.orgId, orgId));
    summary.addRow({ metric: 'Monitored products', value: totals.length });

    const sheet = wb.addWorksheet('Latest prices');
    sheet.columns = [
      { header: 'Title', key: 'title', width: 50 },
      { header: 'Store', key: 'store', width: 24 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Currency', key: 'currency', width: 8 },
      { header: 'Availability', key: 'avail', width: 14 },
      { header: 'Last scraped', key: 'ts', width: 22 },
    ];
    const latest = await db()
      .select({
        title: schema.competitorProducts.title,
        store: schema.stores.name,
        price: schema.competitorProducts.lastSnapshotPrice,
        currency: schema.competitorProducts.lastSnapshotCurrency,
        avail: schema.competitorProducts.lastSnapshotAvailability,
        ts: schema.competitorProducts.lastScrapedAt,
      })
      .from(schema.competitorProducts)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.competitorProducts.storeId))
      .where(eq(schema.competitorProducts.orgId, orgId))
      .limit(50_000);
    rowCount = latest.length;
    for (const r of latest) sheet.addRow({ ...r, ts: r.ts?.toISOString() });

    const buf = await wb.xlsx.writeBuffer();
    body = new Uint8Array(buf);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    extension = 'xlsx';
  }

  const storageKey = `${orgId}/${exportId}.${extension}`;
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.storage
    .from('exports')
    .upload(storageKey, body, { contentType, upsert: true });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);

  return { storageKey, rowCount, contentType };
}

interface ProductIntelligenceExportRow extends Record<string, unknown> {
  canonical_title: string;
  brand: string | null;
  competitors: number;
  current_min_price: string | null;
  current_avg_price: string | null;
  current_max_price: string | null;
  currency: string | null;
  stock_status: string;
  active_discounts: number;
  last_update: string | null;
}

interface ProductHistoryExportRow extends Record<string, unknown> {
  canonical_title: string;
  competitor: string;
  scraped_at: string;
  price: string | null;
  old_price: string | null;
  currency: string | null;
  availability: string | null;
  confidence: string | null;
  source: string | null;
}

async function productIntelligenceRows(orgId: string): Promise<ProductIntelligenceExportRow[]> {
  return db().execute<ProductIntelligenceExportRow>(sql`
    with latest_snapshot as (
      select distinct on (ps.competitor_product_id)
        ps.competitor_product_id,
        ps.price::numeric as price,
        ps.old_price::numeric as old_price,
        ps.currency,
        ps.availability::text as availability,
        ps.scraped_at
      from price_snapshots ps
      where ps.org_id = ${orgId}
      order by ps.competitor_product_id, ps.scraped_at desc
    )
    select
      mp.name as canonical_title,
      mp.brand,
      count(distinct cp.id)::int as competitors,
      min(ls.price)::text as current_min_price,
      avg(ls.price)::numeric(12,2)::text as current_avg_price,
      max(ls.price)::text as current_max_price,
      coalesce((array_agg(ls.currency) filter (where ls.currency is not null))[1], mp.currency, 'EUR') as currency,
      case
        when count(cp.id) filter (where ls.availability = 'in_stock') > 0 and count(cp.id) filter (where ls.availability = 'out_of_stock') > 0 then 'mixed'
        when count(cp.id) filter (where ls.availability = 'in_stock') > 0 then 'in_stock'
        when count(cp.id) filter (where ls.availability = 'out_of_stock') > 0 then 'out_of_stock'
        else 'unknown'
      end as stock_status,
      count(cp.id) filter (where ls.old_price is not null and ls.price is not null and ls.old_price > ls.price)::int as active_discounts,
      greatest(max(cp.last_scraped_at), mp.updated_at)::text as last_update
    from my_products mp
    left join product_matches pm on pm.my_product_id = mp.id and pm.status = 'confirmed'
    left join competitor_products cp on cp.id = pm.competitor_product_id
    left join latest_snapshot ls on ls.competitor_product_id = cp.id
    where mp.org_id = ${orgId}
    group by mp.id
    order by last_update desc nulls last
    limit 100000
  `);
}
