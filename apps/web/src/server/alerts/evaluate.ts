/**
 * Alert rule evaluator. Two entry points:
 *  - evaluateAlertsForSnapshot — called after each new price/availability snapshot.
 *  - evaluateNoChangeAlerts — hourly sweep for "stale data" / "product disappeared".
 */
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, schema } from '@/lib/db';
import { dispatchNotification } from '@/server/notifications/dispatch';

interface SnapshotChange {
  orgId: string;
  competitorProductId: string;
  newPrice: number | null;
  prevPrice: number | null;
  newAvailability: string;
  prevAvailability: string | null;
  currency: string | null;
}

function dedupKey(parts: (string | number | null | undefined)[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 32);
}

export async function evaluateAlertsForSnapshot(c: SnapshotChange): Promise<void> {
  // Pull all active alert rules in this org that could apply to this product
  const product = await db()
    .select()
    .from(schema.competitorProducts)
    .where(eq(schema.competitorProducts.id, c.competitorProductId))
    .limit(1);
  if (!product[0]) return;
  const compProduct = product[0];

  const candidateMatches = await db()
    .select()
    .from(schema.productMatches)
    .where(
      and(
        eq(schema.productMatches.competitorProductId, c.competitorProductId),
        eq(schema.productMatches.status, 'confirmed'),
      ),
    );

  // Load all active rules in the org; filter scope in-memory (cheap, small per org).
  const rules = await db()
    .select()
    .from(schema.alertRules)
    .where(and(eq(schema.alertRules.orgId, c.orgId), eq(schema.alertRules.active, true)));

  const today = new Date().toISOString().slice(0, 10);

  for (const rule of rules) {
    // Scope filter
    if (rule.scopeCompetitorProductId && rule.scopeCompetitorProductId !== c.competitorProductId) continue;
    if (rule.scopeStoreId && rule.scopeStoreId !== compProduct.storeId) continue;
    if (rule.scopeMyProductId && !candidateMatches.some((m) => m.myProductId === rule.scopeMyProductId)) continue;

    const params = (rule.params ?? {}) as { thresholdPct?: number; pricePct?: number };
    const triggered = await evaluateOne({
      rule,
      params,
      change: c,
      compProductTitle: compProduct.title,
      matches: candidateMatches,
    });
    if (!triggered) continue;

    const key = dedupKey([rule.id, c.competitorProductId, today, triggered.dedupTag]);
    await dispatchNotification({
      orgId: c.orgId,
      alertRuleId: rule.id,
      channels: rule.channels as ('in_app' | 'email' | 'webhook')[],
      title: triggered.title,
      body: triggered.body,
      payload: triggered.payload,
      dedupKey: key,
    });
  }
}

interface OneInput {
  rule: typeof schema.alertRules.$inferSelect;
  params: { thresholdPct?: number; pricePct?: number };
  change: SnapshotChange;
  compProductTitle: string | null;
  matches: (typeof schema.productMatches.$inferSelect)[];
}

interface Triggered {
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupTag: string;
}

async function evaluateOne(i: OneInput): Promise<Triggered | null> {
  const { rule, params, change, compProductTitle } = i;
  const productLabel = compProductTitle ?? 'a competitor product';
  switch (rule.type) {
    case 'price_drop_pct': {
      if (change.newPrice == null || change.prevPrice == null || change.prevPrice <= 0) return null;
      const pct = ((change.newPrice - change.prevPrice) / change.prevPrice) * 100;
      const threshold = params.thresholdPct ?? params.pricePct ?? 5;
      if (-pct < threshold) return null;
      return {
        title: `Price drop on ${productLabel}`,
        body: `Price dropped ${Math.abs(pct).toFixed(1)}% (${change.prevPrice} → ${change.newPrice} ${change.currency ?? ''}).`,
        payload: { competitorProductId: change.competitorProductId, pct },
        dedupTag: 'drop',
      };
    }
    case 'price_rise_pct': {
      if (change.newPrice == null || change.prevPrice == null || change.prevPrice <= 0) return null;
      const pct = ((change.newPrice - change.prevPrice) / change.prevPrice) * 100;
      const threshold = params.thresholdPct ?? params.pricePct ?? 5;
      if (pct < threshold) return null;
      return {
        title: `Price increase on ${productLabel}`,
        body: `Price rose ${pct.toFixed(1)}% (${change.prevPrice} → ${change.newPrice} ${change.currency ?? ''}).`,
        payload: { competitorProductId: change.competitorProductId, pct },
        dedupTag: 'rise',
      };
    }
    case 'back_in_stock': {
      if (change.prevAvailability === 'out_of_stock' && change.newAvailability === 'in_stock') {
        return {
          title: `Back in stock: ${productLabel}`,
          body: `Competitor product is available again.`,
          payload: { competitorProductId: change.competitorProductId },
          dedupTag: 'back',
        };
      }
      return null;
    }
    case 'out_of_stock': {
      if (change.prevAvailability !== 'out_of_stock' && change.newAvailability === 'out_of_stock') {
        return {
          title: `Out of stock: ${productLabel}`,
          body: `Competitor product just went out of stock — possible opportunity to raise your price.`,
          payload: { competitorProductId: change.competitorProductId },
          dedupTag: 'oos',
        };
      }
      return null;
    }
    case 'competitor_cheaper_than_me': {
      if (change.newPrice == null) return null;
      const myProductIds = i.matches.map((m) => m.myProductId);
      if (myProductIds.length === 0) return null;
      const myProducts = await db()
        .select()
        .from(schema.myProducts)
        .where(sql`id = ANY(${myProductIds})`);
      const triggered = myProducts.find(
        (mp) => mp.myPrice && Number(mp.myPrice) > change.newPrice!,
      );
      if (!triggered) return null;
      const diff = (Number(triggered.myPrice) - change.newPrice).toFixed(2);
      return {
        title: `Competitor cheaper than ${triggered.name}`,
        body: `Competitor is ${diff} ${change.currency ?? ''} cheaper than your ${triggered.sku}.`,
        payload: { competitorProductId: change.competitorProductId, myProductId: triggered.id, diff },
        dedupTag: 'cheaper',
      };
    }
    case 'my_price_above_market_pct': {
      const threshold = params.thresholdPct ?? 5;
      const myProductIds = i.matches.map((m) => m.myProductId);
      if (myProductIds.length === 0 || change.newPrice == null) return null;
      const myProducts = await db()
        .select()
        .from(schema.myProducts)
        .where(sql`id = ANY(${myProductIds})`);
      const tooHigh = myProducts.find((mp) => {
        if (!mp.myPrice) return false;
        const my = Number(mp.myPrice);
        return ((my - change.newPrice!) / change.newPrice!) * 100 >= threshold;
      });
      if (!tooHigh) return null;
      return {
        title: `${tooHigh.name} is above market`,
        body: `Your price (${tooHigh.myPrice}) exceeds competitor by more than ${threshold}%.`,
        payload: { myProductId: tooHigh.id, competitorProductId: change.competitorProductId },
        dedupTag: 'above-market',
      };
    }
    default:
      return null;
  }
}

/** Hourly: catch products that haven't been scraped in a long time. Could be expanded. */
export async function evaluateNoChangeAlerts(orgId: string): Promise<void> {
  const staleRows = await db()
    .select({ id: schema.competitorProducts.id, title: schema.competitorProducts.title })
    .from(schema.competitorProducts)
    .where(
      and(
        eq(schema.competitorProducts.orgId, orgId),
        eq(schema.competitorProducts.active, true),
        sql`last_scraped_at < now() - interval '48 hours'`,
      ),
    )
    .limit(20);

  if (staleRows.length === 0) return;
  const today = new Date().toISOString().slice(0, 10);
  await dispatchNotification({
    orgId,
    channels: ['in_app'],
    title: 'Stale data warning',
    body: `${staleRows.length} competitor product(s) have not been scraped in over 48 hours.`,
    payload: { staleIds: staleRows.map((r) => r.id) },
    dedupKey: dedupKey([orgId, 'stale', today]),
  });
}
