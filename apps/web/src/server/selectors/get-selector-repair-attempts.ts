import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export async function getSelectorRepairAttempts(orgId: string, limit = 100) {
  return db()
    .select({
      attempt: schema.selectorRepairAttempts,
      storeName: schema.stores.name,
      productTitle: schema.competitorProducts.title,
      productUrl: schema.competitorProducts.url,
    })
    .from(schema.selectorRepairAttempts)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.selectorRepairAttempts.competitorId))
    .leftJoin(schema.competitorProducts, eq(schema.competitorProducts.id, schema.selectorRepairAttempts.productId))
    .where(eq(schema.selectorRepairAttempts.orgId, orgId))
    .orderBy(desc(schema.selectorRepairAttempts.createdAt))
    .limit(limit);
}
