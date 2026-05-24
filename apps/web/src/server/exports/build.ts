/**
 * Build CSV / XLSX bytes for a given export kind. Uploads to Supabase Storage
 * under {orgId}/{exportId}.{ext} and returns the storage key.
 */
import { eq, and, gte, desc } from 'drizzle-orm';
import { stringify as csvStringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { db, schema } from '@/lib/db';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type ExportKind = 'snapshots_csv' | 'products_csv' | 'matches_csv' | 'analytics_xlsx';

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
