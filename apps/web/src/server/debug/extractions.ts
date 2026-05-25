import { and, desc, eq } from 'drizzle-orm';
import type { ScrapeResponse } from '@cr/shared';
import { db, schema } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export async function listExtractionArtifacts(orgId: string, limit = 50) {
  return db()
    .select({
      artifact: schema.extractionDebugArtifacts,
      storeName: schema.stores.name,
      productTitle: schema.competitorProducts.title,
    })
    .from(schema.extractionDebugArtifacts)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.extractionDebugArtifacts.storeId))
    .leftJoin(
      schema.competitorProducts,
      eq(schema.competitorProducts.id, schema.extractionDebugArtifacts.competitorProductId),
    )
    .where(eq(schema.extractionDebugArtifacts.orgId, orgId))
    .orderBy(desc(schema.extractionDebugArtifacts.createdAt))
    .limit(limit);
}

export async function getExtractionArtifact(orgId: string, id: string) {
  const rows = await db()
    .select({
      artifact: schema.extractionDebugArtifacts,
      storeName: schema.stores.name,
      productTitle: schema.competitorProducts.title,
    })
    .from(schema.extractionDebugArtifacts)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.extractionDebugArtifacts.storeId))
    .leftJoin(
      schema.competitorProducts,
      eq(schema.competitorProducts.id, schema.extractionDebugArtifacts.competitorProductId),
    )
    .where(and(eq(schema.extractionDebugArtifacts.orgId, orgId), eq(schema.extractionDebugArtifacts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function replayExtractionArtifact(orgId: string, id: string): Promise<ScrapeResponse | null> {
  const row = await getExtractionArtifact(orgId, id);
  const artifact = row?.artifact;
  if (!artifact?.htmlSnapshot) return null;
  const env = serverEnv();
  const res = await fetch(`${env.WORKER_URL}/scrape/replay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
    },
    body: JSON.stringify({
      html: artifact.htmlSnapshot,
      rules: artifact.selectorSetJson,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as ScrapeResponse;
}

export async function getExtractionArtifactUrls(orgId: string, id: string) {
  const row = await getExtractionArtifact(orgId, id);
  const artifact = row?.artifact;
  if (!artifact) return null;
  const storage = createSupabaseServiceRoleClient();
  const [screenshot, html] = await Promise.all([
    artifact.screenshotStorageKey
      ? storage.storage.from('screenshots').createSignedUrl(artifact.screenshotStorageKey, 60 * 30)
      : Promise.resolve({ data: null, error: null }),
    artifact.htmlStorageKey
      ? storage.storage.from('html').createSignedUrl(artifact.htmlStorageKey, 60 * 30)
      : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    screenshotUrl: screenshot.data?.signedUrl ?? null,
    htmlUrl: html.data?.signedUrl ?? null,
  };
}
