import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getExtractionArtifactUrls } from '@/server/debug/extractions';

export async function getSelectorRepairDetail(orgId: string, attemptId: string) {
  const rows = await db()
    .select({
      attempt: schema.selectorRepairAttempts,
      store: schema.stores,
      product: schema.competitorProducts,
      rules: schema.scrapingRules,
      artifact: schema.extractionDebugArtifacts,
    })
    .from(schema.selectorRepairAttempts)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.selectorRepairAttempts.competitorId))
    .leftJoin(schema.competitorProducts, eq(schema.competitorProducts.id, schema.selectorRepairAttempts.productId))
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .leftJoin(schema.extractionDebugArtifacts, eq(schema.extractionDebugArtifacts.id, schema.selectorRepairAttempts.debugArtifactId))
    .where(and(eq(schema.selectorRepairAttempts.orgId, orgId), eq(schema.selectorRepairAttempts.id, attemptId)))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row) return null;
  const artifactUrls = row.artifact ? await getExtractionArtifactUrls(orgId, row.artifact.id).catch(() => null) : null;
  return { ...row, artifactUrls };
}
