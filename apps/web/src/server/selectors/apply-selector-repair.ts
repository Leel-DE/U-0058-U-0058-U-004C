import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { recordSelectorVersions, type SelectorField } from './versioning';

export const PRODUCT_REPAIR_SELECTOR_FIELDS = [
  'titleSelector',
  'priceSelector',
  'oldPriceSelector',
  'availabilitySelector',
  'imageSelector',
  'brandSelector',
  'skuSelector',
  'breadcrumbsSelector',
] as const satisfies readonly SelectorField[];

type ProductRepairSelectorField = (typeof PRODUCT_REPAIR_SELECTOR_FIELDS)[number];
type ProductRepairSelectors = Partial<Record<ProductRepairSelectorField, string | null>>;

interface ValidationLike {
  valid?: boolean;
  overallConfidence?: number;
  errors?: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function pickProductSelectors(value: unknown): ProductRepairSelectors {
  const record = asRecord(value);
  const selectors: ProductRepairSelectors = {};
  for (const field of PRODUCT_REPAIR_SELECTOR_FIELDS) {
    const raw = record[field];
    if (typeof raw === 'string' && raw.trim()) selectors[field] = raw.trim();
    else if (raw === null) selectors[field] = null;
  }
  return selectors;
}

export function mergeProductRepairSelectors(oldSelectors: unknown, suggestedSelectors: unknown): ProductRepairSelectors {
  const merged = pickProductSelectors(oldSelectors);
  const suggested = pickProductSelectors(suggestedSelectors);
  for (const field of PRODUCT_REPAIR_SELECTOR_FIELDS) {
    const value = suggested[field];
    if (value && value.trim()) merged[field] = value.trim();
  }
  return merged;
}

function validationFrom(value: unknown): ValidationLike {
  const record = asRecord(value);
  return {
    valid: record.valid === true,
    overallConfidence: typeof record.overallConfidence === 'number' ? record.overallConfidence : undefined,
    errors: Array.isArray(record.errors) ? record.errors.map(String) : undefined,
  };
}

export async function applySelectorRepair(args: {
  orgId: string;
  attemptId: string;
  changedBy?: string | null;
  requireAutoThreshold?: boolean;
}) {
  const rows = await db()
    .select({
      attempt: schema.selectorRepairAttempts,
      storeId: schema.stores.id,
      rules: schema.scrapingRules,
    })
    .from(schema.selectorRepairAttempts)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.selectorRepairAttempts.competitorId))
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .where(and(eq(schema.selectorRepairAttempts.id, args.attemptId), eq(schema.selectorRepairAttempts.orgId, args.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error('Selector repair attempt not found');
  if (row.attempt.status === 'applied') return { attemptId: args.attemptId, applied: true, alreadyApplied: true };

  const validation = validationFrom(row.attempt.validationResultJson);
  const confidence = validation.overallConfidence ?? Number(row.attempt.confidence ?? 0);
  if (!validation.valid) {
    throw new Error(`Cannot apply invalid selector repair: ${(validation.errors ?? []).join('; ') || 'validation failed'}`);
  }
  if (args.requireAutoThreshold && confidence < 0.75) {
    throw new Error('Selector repair confidence is below auto-apply threshold');
  }

  const appliedSelectors = mergeProductRepairSelectors(
    row.attempt.oldSelectorsJson,
    row.attempt.suggestedSelectorsJson,
  );
  const oldSelectors = pickProductSelectors(row.attempt.oldSelectorsJson);

  await db()
    .insert(schema.scrapingRules)
    .values({
      storeId: row.storeId,
      titleSelector: appliedSelectors.titleSelector ?? null,
      priceSelector: appliedSelectors.priceSelector ?? null,
      oldPriceSelector: appliedSelectors.oldPriceSelector ?? null,
      availabilitySelector: appliedSelectors.availabilitySelector ?? null,
      imageSelector: appliedSelectors.imageSelector ?? null,
      brandSelector: appliedSelectors.brandSelector ?? null,
      skuSelector: appliedSelectors.skuSelector ?? null,
      breadcrumbsSelector: appliedSelectors.breadcrumbsSelector ?? null,
      useJsonLd: row.rules?.useJsonLd ?? true,
      useOpenGraph: row.rules?.useOpenGraph ?? true,
    })
    .onConflictDoUpdate({
      target: schema.scrapingRules.storeId,
      set: {
        titleSelector: appliedSelectors.titleSelector ?? null,
        priceSelector: appliedSelectors.priceSelector ?? null,
        oldPriceSelector: appliedSelectors.oldPriceSelector ?? null,
        availabilitySelector: appliedSelectors.availabilitySelector ?? null,
        imageSelector: appliedSelectors.imageSelector ?? null,
        brandSelector: appliedSelectors.brandSelector ?? null,
        skuSelector: appliedSelectors.skuSelector ?? null,
        breadcrumbsSelector: appliedSelectors.breadcrumbsSelector ?? null,
        updatedAt: new Date(),
      },
    });

  await recordSelectorVersions({
    storeId: row.storeId,
    selectors: appliedSelectors,
    source: 'ai_repair',
    changedBy: args.changedBy ?? null,
    validation: row.attempt.validationResultJson,
    confidence,
    previousSelectors: oldSelectors,
  });

  await db()
    .update(schema.selectorRepairAttempts)
    .set({
      status: 'applied',
      appliedSelectorsJson: appliedSelectors,
      confidence: confidence.toFixed(3),
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.selectorRepairAttempts.id, args.attemptId));

  return { attemptId: args.attemptId, applied: true, appliedSelectors };
}
