/**
 * Generate match suggestions between my_products and competitor_products in an org.
 * Strategy (in order, highest confidence first):
 *   1) GTIN exact match → confidence 0.99
 *   2) SKU exact match (when competitor has parsed SKU) → 0.95
 *   3) Brand + model token overlap → 0.7
 *   4) Title trigram similarity ≥ 0.5 → similarity (capped at 0.85)
 */
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

interface Suggestion {
  myProductId: string;
  competitorProductId: string;
  method: 'manual' | 'sku' | 'gtin' | 'title_similarity' | 'brand_model';
  confidence: number;
}

export async function generateSuggestions(orgId: string, limit = 200): Promise<Suggestion[]> {
  // GTIN exact
  const gtinMatches = (await db().execute<{
    my_id: string; comp_id: string;
  }>(sql`
    select mp.id as my_id, cp.id as comp_id
    from my_products mp
    join competitor_products cp on cp.org_id = mp.org_id
      and cp.gtin is not null and mp.gtin is not null
      and cp.gtin = mp.gtin
    where mp.org_id = ${orgId}
    limit ${limit}
  `)) as Array<{ my_id: string; comp_id: string }>;

  const skuMatches = (await db().execute<{ my_id: string; comp_id: string }>(sql`
    select mp.id as my_id, cp.id as comp_id
    from my_products mp
    join competitor_products cp on cp.org_id = mp.org_id
      and cp.sku is not null and mp.sku is not null
      and lower(cp.sku) = lower(mp.sku)
    where mp.org_id = ${orgId}
    limit ${limit}
  `)) as Array<{ my_id: string; comp_id: string }>;

  const trigramMatches = (await db().execute<{
    my_id: string; comp_id: string; sim: number;
  }>(sql`
    select mp.id as my_id, cp.id as comp_id,
           similarity(mp.name, coalesce(cp.title, '')) as sim
    from my_products mp
    join competitor_products cp on cp.org_id = mp.org_id
      and cp.title is not null
      and similarity(mp.name, cp.title) >= 0.5
    where mp.org_id = ${orgId}
    order by sim desc
    limit ${limit}
  `)) as Array<{ my_id: string; comp_id: string; sim: number }>;

  const all: Suggestion[] = [
    ...gtinMatches.map((r) => ({
      myProductId: r.my_id,
      competitorProductId: r.comp_id,
      method: 'gtin' as const,
      confidence: 0.99,
    })),
    ...skuMatches.map((r) => ({
      myProductId: r.my_id,
      competitorProductId: r.comp_id,
      method: 'sku' as const,
      confidence: 0.95,
    })),
    ...trigramMatches.map((r) => ({
      myProductId: r.my_id,
      competitorProductId: r.comp_id,
      method: 'title_similarity' as const,
      confidence: Math.min(0.85, Number(r.sim)),
    })),
  ];

  // dedupe pairs (keep highest confidence)
  const map = new Map<string, Suggestion>();
  for (const s of all) {
    const k = `${s.myProductId}:${s.competitorProductId}`;
    const prev = map.get(k);
    if (!prev || prev.confidence < s.confidence) map.set(k, s);
  }
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
}

export async function persistSuggestions(orgId: string, limit = 200): Promise<number> {
  const suggestions = await generateSuggestions(orgId, limit);
  if (suggestions.length === 0) return 0;
  await db()
    .insert(schema.productMatches)
    .values(
      suggestions.map((s) => ({
        orgId,
        myProductId: s.myProductId,
        competitorProductId: s.competitorProductId,
        method: s.method,
        confidence: s.confidence.toFixed(3),
        status: 'suggested' as const,
      })),
    )
    .onConflictDoNothing();
  return suggestions.length;
}
