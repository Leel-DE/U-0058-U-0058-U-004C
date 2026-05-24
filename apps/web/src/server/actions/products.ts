'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { schemas } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { logAudit } from '@/lib/audit';

function urlHash(url: string) {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

export const createMyProduct = defineAction(
  schemas.createMyProductSchema,
  async (input, ctx) => {
    try {
      const [row] = await db()
        .insert(schema.myProducts)
        .values({
          orgId: ctx.orgId,
          sku: input.sku,
          gtin: input.gtin,
          brand: input.brand,
          name: input.name,
          myPrice: input.myPrice?.toString(),
          currency: input.currency,
          url: input.url,
          imageUrl: input.imageUrl,
          categoryId: input.categoryId,
          notes: input.notes,
          createdBy: ctx.user.id,
        })
        .returning();
      if (!row) throw new Error('Failed to insert');
      await logAudit({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        action: 'my_product.create',
        entity: 'my_product',
        entityId: row.id,
        after: { sku: row.sku },
      });
      revalidatePath('/products');
      return { id: row.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('my_products_org_sku_unique')) {
        throw new Error('A product with this SKU already exists.');
      }
      throw err;
    }
  },
  { roles: ['owner', 'manager'] },
);

const updateMyProductInput = schemas.createMyProductSchema.partial().extend({
  id: z.string().uuid(),
});
export const updateMyProduct = defineAction(
  updateMyProductInput,
  async (input, ctx) => {
    const { id, ...rest } = input;
    await db()
      .update(schema.myProducts)
      .set({
        ...rest,
        myPrice: rest.myPrice?.toString(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.myProducts.id, id), eq(schema.myProducts.orgId, ctx.orgId)));
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { ok: true as const };
  },
  { roles: ['owner', 'manager'] },
);

const deleteSchema = z.object({ id: z.string().uuid() });
export const deleteMyProduct = defineAction(
  deleteSchema,
  async ({ id }, ctx) => {
    await db()
      .delete(schema.myProducts)
      .where(and(eq(schema.myProducts.id, id), eq(schema.myProducts.orgId, ctx.orgId)));
    revalidatePath('/products');
    return { ok: true as const };
  },
  { roles: ['owner'] },
);

export const createCompetitorProduct = defineAction(
  schemas.createCompetitorProductSchema,
  async (input, ctx) => {
    // verify store belongs to org
    const store = await db()
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!store[0]) throw new Error('Store not found');

    try {
      const [row] = await db()
        .insert(schema.competitorProducts)
        .values({
          orgId: ctx.orgId,
          storeId: input.storeId,
          url: input.url,
          urlHash: urlHash(input.url),
          externalId: input.externalId,
          title: input.initialTitle ?? null,
          createdBy: ctx.user.id,
          nextRunAt: new Date(),
        })
        .returning();
      if (!row) throw new Error('Failed to insert');
      revalidatePath(`/competitors/${input.storeId}`);
      revalidatePath('/products');
      return { id: row.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('competitor_products_store_url_unique')) {
        throw new Error('This URL is already being monitored on that store.');
      }
      throw err;
    }
  },
  { roles: ['owner', 'manager'] },
);

const bulkCompetitorSchema = z.object({
  storeId: z.string().uuid(),
  csv: z.string().min(1).max(2_000_000),
});

interface BulkRow {
  url: string;
  external_id?: string;
  title?: string;
}

export const bulkImportCompetitorProducts = defineAction(
  bulkCompetitorSchema,
  async (input, ctx) => {
    const owned = await db()
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.storeId), eq(schema.stores.orgId, ctx.orgId)))
      .limit(1);
    if (!owned[0]) throw new Error('Store not found');

    let parsed: BulkRow[];
    try {
      parsed = parseCsvSync(input.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as BulkRow[];
    } catch (err) {
      throw new Error(`CSV parse error: ${(err as Error).message}`);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const r of parsed) {
      if (!r.url || !/^https?:\/\//i.test(r.url)) {
        skipped++;
        errors.push(`Skipped row with invalid URL: ${r.url ?? '(empty)'}`);
        continue;
      }
      try {
        await db()
          .insert(schema.competitorProducts)
          .values({
            orgId: ctx.orgId,
            storeId: input.storeId,
            url: r.url,
            urlHash: urlHash(r.url),
            externalId: r.external_id ?? null,
            title: r.title ?? null,
            createdBy: ctx.user.id,
            nextRunAt: new Date(),
          })
          .onConflictDoNothing();
        imported++;
      } catch (err) {
        skipped++;
        errors.push(`${r.url}: ${(err as Error).message}`);
      }
    }

    await logAudit({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'competitor_product.bulk_import',
      entity: 'store',
      entityId: input.storeId,
      after: { imported, skipped },
    });
    revalidatePath('/products');
    revalidatePath(`/competitors/${input.storeId}`);
    return { imported, skipped, errors: errors.slice(0, 20) };
  },
  { roles: ['owner', 'manager'] },
);

const bulkMySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
});

interface BulkMyRow {
  sku: string;
  name: string;
  brand?: string;
  gtin?: string;
  price?: string;
}

export const bulkImportMyProducts = defineAction(
  bulkMySchema,
  async (input, ctx) => {
    let parsed: BulkMyRow[];
    try {
      parsed = parseCsvSync(input.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as BulkMyRow[];
    } catch (err) {
      throw new Error(`CSV parse error: ${(err as Error).message}`);
    }

    let imported = 0;
    let skipped = 0;

    for (const r of parsed) {
      if (!r.sku || !r.name) {
        skipped++;
        continue;
      }
      try {
        await db()
          .insert(schema.myProducts)
          .values({
            orgId: ctx.orgId,
            sku: r.sku,
            name: r.name,
            brand: r.brand,
            gtin: r.gtin,
            myPrice: r.price ? Number(r.price).toFixed(2) : null,
            currency: input.currency,
            createdBy: ctx.user.id,
          })
          .onConflictDoNothing();
        imported++;
      } catch {
        skipped++;
      }
    }

    revalidatePath('/products');
    return { imported, skipped };
  },
  { roles: ['owner', 'manager'] },
);
