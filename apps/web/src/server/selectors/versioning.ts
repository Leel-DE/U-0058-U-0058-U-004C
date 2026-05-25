import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export type SelectorSource = 'manual' | 'ai_detected' | 'ai_repair' | 'heuristic' | 'rollback';

const SELECTOR_FIELDS = [
  'titleSelector',
  'priceSelector',
  'oldPriceSelector',
  'availabilitySelector',
  'imageSelector',
  'brandSelector',
  'skuSelector',
  'breadcrumbsSelector',
  'productCardSelector',
  'cardTitleSelector',
  'cardPriceSelector',
  'cardOldPriceSelector',
  'cardImageSelector',
  'cardLinkSelector',
  'cardAvailabilitySelector',
  'paginationNextSelector',
  'loadMoreSelector',
  'shippingSelector',
  'ratingSelector',
  'priceRegex',
] as const;

export type SelectorField = (typeof SELECTOR_FIELDS)[number];

type RulesLike = Partial<Record<SelectorField, string | null | undefined>>;

function selectorEntries(selectors: RulesLike) {
  return SELECTOR_FIELDS.map((field) => ({ field, value: selectors[field] ?? null })).filter(
    (entry) => entry.value != null && entry.value.trim().length > 0,
  );
}

export async function recordSelectorVersions(args: {
  storeId: string;
  selectors: RulesLike;
  source: SelectorSource;
  changedBy?: string | null;
  validation?: unknown;
  confidence?: number | null;
}) {
  const entries = selectorEntries(args.selectors);
  if (entries.length === 0) return;

  await db().transaction(async (tx) => {
    for (const entry of entries) {
      const [latest] = await tx.execute<{ version: number; selector_value: string | null }>(sql`
        select version, selector_value
        from selector_versions
        where store_id = ${args.storeId} and selector_type = ${entry.field}
        order by version desc
        limit 1
      `);
      if (latest?.selector_value === entry.value) continue;
      await tx.insert(schema.selectorVersions).values({
        storeId: args.storeId,
        version: (latest?.version ?? 0) + 1,
        selectorType: entry.field,
        selectorValue: entry.value,
        previousSelectorValue: latest?.selector_value ?? null,
        source: args.source,
        confidence: args.confidence == null ? null : String(args.confidence),
        validationJson: args.validation ?? null,
        changedBy: args.changedBy ?? null,
        validatedAt: args.validation ? new Date() : null,
      });
    }
  });
}

export async function rollbackSelectorVersion(args: {
  selectorVersionId: string;
  changedBy?: string | null;
}) {
  const rows = await db()
    .select()
    .from(schema.selectorVersions)
    .where(eq(schema.selectorVersions.id, args.selectorVersionId))
    .limit(1);
  const version = rows[0];
  if (!version) throw new Error('Selector version not found');
  if (!SELECTOR_FIELDS.includes(version.selectorType as SelectorField)) {
    throw new Error(`Unsupported selector type: ${version.selectorType}`);
  }

  const selectorType = version.selectorType as SelectorField;
  const [current] = await db()
    .select()
    .from(schema.scrapingRules)
    .where(eq(schema.scrapingRules.storeId, version.storeId))
    .limit(1);

  await db().transaction(async (tx) => {
    await tx
      .insert(schema.scrapingRules)
      .values({
        storeId: version.storeId,
        [selectorType]: version.selectorValue,
        useJsonLd: current?.useJsonLd ?? true,
        useOpenGraph: current?.useOpenGraph ?? true,
      })
      .onConflictDoUpdate({
        target: schema.scrapingRules.storeId,
        set: {
          [selectorType]: version.selectorValue,
          updatedAt: new Date(),
        },
      });

    const [latest] = await tx.execute<{ version: number; selector_value: string | null }>(sql`
      select version, selector_value
      from selector_versions
      where store_id = ${version.storeId} and selector_type = ${selectorType}
      order by version desc
      limit 1
    `);
    await tx.insert(schema.selectorVersions).values({
      storeId: version.storeId,
      version: (latest?.version ?? 0) + 1,
      selectorType,
      selectorValue: version.selectorValue,
      previousSelectorValue: latest?.selector_value ?? null,
      source: 'rollback',
      confidence: version.confidence,
      validationJson: { rollbackTo: args.selectorVersionId },
      changedBy: args.changedBy ?? null,
      validatedAt: new Date(),
      rolledBackFromId: args.selectorVersionId,
    });
  });

  return { storeId: version.storeId, selectorType };
}
