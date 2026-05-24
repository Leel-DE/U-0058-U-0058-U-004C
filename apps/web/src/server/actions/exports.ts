'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { defineAction } from '@/lib/action';
import { buildExport, type ExportKind } from '@/server/exports/build';

const createExportSchema = z.object({
  kind: z.enum(['snapshots_csv', 'products_csv', 'matches_csv', 'analytics_xlsx']),
  params: z.record(z.unknown()).default({}),
});

export const createExport = defineAction(
  createExportSchema,
  async (input, ctx) => {
    const [row] = await db()
      .insert(schema.exports_)
      .values({
        orgId: ctx.orgId,
        kind: input.kind as ExportKind,
        params: input.params,
        status: 'running',
        createdBy: ctx.user.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning();
    if (!row) throw new Error('Failed to create export');

    try {
      const result = await buildExport({ orgId: ctx.orgId, kind: input.kind, params: input.params }, row.id);
      await db()
        .update(schema.exports_)
        .set({ status: 'ready', storageKey: result.storageKey, rowCount: String(result.rowCount) })
        .where(eq(schema.exports_.id, row.id));
      revalidatePath('/exports');
      return { id: row.id, storageKey: result.storageKey };
    } catch (err) {
      await db()
        .update(schema.exports_)
        .set({ status: 'failed', errorMessage: (err as Error).message })
        .where(eq(schema.exports_.id, row.id));
      throw err;
    }
  },
  { roles: ['owner', 'manager'] },
);

const downloadSchema = z.object({ id: z.string().uuid() });

export const getExportDownloadUrl = defineAction(
  downloadSchema,
  async ({ id }, ctx) => {
    const rows = await db()
      .select()
      .from(schema.exports_)
      .where(and(eq(schema.exports_.id, id), eq(schema.exports_.orgId, ctx.orgId)))
      .limit(1);
    const row = rows[0];
    if (!row || !row.storageKey) throw new Error('Export not ready');
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.storage.from('exports').createSignedUrl(row.storageKey, 600);
    if (error || !data) throw new Error(error?.message ?? 'signed_url_failed');
    return { url: data.signedUrl };
  },
);
