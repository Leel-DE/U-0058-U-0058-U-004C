import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getContext } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { RulesEditor } from './rules-editor';

export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  if (ctx.role === 'viewer') redirect(`/competitors/${id}`);

  const rows = await db()
    .select({ store: schema.stores, rules: schema.scrapingRules })
    .from(schema.stores)
    .leftJoin(schema.scrapingRules, eq(schema.scrapingRules.storeId, schema.stores.id))
    .where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scraping rules · {row.store.name}</h1>
        <p className="text-sm text-muted-foreground">
          We try JSON-LD and OpenGraph first; CSS selectors are the fallback. Test against a real
          product URL on the right before saving.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Extraction rules</CardTitle>
          <CardDescription>
            Use full CSS selectors (e.g. <code>h1.product-title</code>, <code>.price .current</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RulesEditor
            storeId={row.store.id}
            defaultValues={{
              titleSelector: row.rules?.titleSelector ?? '',
              priceSelector: row.rules?.priceSelector ?? '',
              oldPriceSelector: row.rules?.oldPriceSelector ?? '',
              availabilitySelector: row.rules?.availabilitySelector ?? '',
              imageSelector: row.rules?.imageSelector ?? '',
              brandSelector: row.rules?.brandSelector ?? '',
              skuSelector: row.rules?.skuSelector ?? '',
              breadcrumbsSelector: row.rules?.breadcrumbsSelector ?? '',
              productCardSelector: row.rules?.productCardSelector ?? '',
              cardTitleSelector: row.rules?.cardTitleSelector ?? '',
              cardPriceSelector: row.rules?.cardPriceSelector ?? '',
              cardOldPriceSelector: row.rules?.cardOldPriceSelector ?? '',
              cardImageSelector: row.rules?.cardImageSelector ?? '',
              cardLinkSelector: row.rules?.cardLinkSelector ?? '',
              cardAvailabilitySelector: row.rules?.cardAvailabilitySelector ?? '',
              paginationNextSelector: row.rules?.paginationNextSelector ?? '',
              loadMoreSelector: row.rules?.loadMoreSelector ?? '',
              shippingSelector: row.rules?.shippingSelector ?? '',
              ratingSelector: row.rules?.ratingSelector ?? '',
              priceRegex: row.rules?.priceRegex ?? '',
              useJsonLd: row.rules?.useJsonLd ?? true,
              useOpenGraph: row.rules?.useOpenGraph ?? true,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
