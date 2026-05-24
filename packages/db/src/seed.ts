// Seeds a demo organization with a couple of stores, products, snapshots and an alert rule.
// Idempotent — re-running upserts everything by deterministic IDs.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  organizations,
  stores,
  scrapingRules,
  myProducts,
  competitorProducts,
  priceSnapshots,
  alertRules,
  categories,
} from './schema';
import { createHash } from 'node:crypto';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const STORE_A_ID = '00000000-0000-4000-8000-000000000010';
const STORE_B_ID = '00000000-0000-4000-8000-000000000011';
const CAT_ID = '00000000-0000-4000-8000-000000000020';
const MY_PROD_ID = '00000000-0000-4000-8000-000000000030';
const COMP_PROD_A = '00000000-0000-4000-8000-000000000040';
const COMP_PROD_B = '00000000-0000-4000-8000-000000000041';
const ALERT_ID = '00000000-0000-4000-8000-000000000050';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  console.log('Seeding demo organization …');

  await db
    .insert(organizations)
    .values({ id: ORG_ID, name: 'Demo Shop', slug: 'demo', plan: 'free' })
    .onConflictDoNothing();

  await db
    .insert(categories)
    .values({ id: CAT_ID, orgId: ORG_ID, name: 'Headphones', slug: 'headphones' })
    .onConflictDoNothing();

  await db
    .insert(stores)
    .values([
      {
        id: STORE_A_ID,
        orgId: ORG_ID,
        name: 'Example Electronics',
        domain: 'example-electronics.test',
        countryCode: 'DE',
        currency: 'EUR',
        crawlFrequencyMinutes: 1440,
        crawlDelaySeconds: 5,
      },
      {
        id: STORE_B_ID,
        orgId: ORG_ID,
        name: 'Acme Audio',
        domain: 'acme-audio.test',
        countryCode: 'GB',
        currency: 'GBP',
        crawlFrequencyMinutes: 720,
        crawlDelaySeconds: 7,
        jsRequired: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(scrapingRules)
    .values([
      {
        storeId: STORE_A_ID,
        titleSelector: 'h1.product-title',
        priceSelector: '.price .current',
        oldPriceSelector: '.price .was',
        availabilitySelector: '.stock-status',
        imageSelector: '.product-gallery img',
        useJsonLd: true,
        useOpenGraph: true,
      },
      {
        storeId: STORE_B_ID,
        titleSelector: 'h1',
        priceSelector: '[data-test="price"]',
        useJsonLd: true,
        useOpenGraph: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(myProducts)
    .values({
      id: MY_PROD_ID,
      orgId: ORG_ID,
      sku: 'HP-2000',
      gtin: '0123456789012',
      brand: 'Acme',
      name: 'Acme HP-2000 over-ear headphones',
      myPrice: '199.00',
      currency: 'EUR',
      categoryId: CAT_ID,
    })
    .onConflictDoNothing();

  const urlA = 'https://example-electronics.test/headphones/acme-hp-2000';
  const urlB = 'https://acme-audio.test/products/hp-2000';
  await db
    .insert(competitorProducts)
    .values([
      {
        id: COMP_PROD_A,
        orgId: ORG_ID,
        storeId: STORE_A_ID,
        url: urlA,
        urlHash: hash(urlA),
        title: 'Acme HP-2000 over-ear headphones',
        brand: 'Acme',
      },
      {
        id: COMP_PROD_B,
        orgId: ORG_ID,
        storeId: STORE_B_ID,
        url: urlB,
        urlHash: hash(urlB),
        title: 'HP-2000 wireless headphones',
        brand: 'Acme',
      },
    ])
    .onConflictDoNothing();

  // Synthetic 30-day price history (decreasing trend on store A, flat on store B).
  const now = Date.now();
  const snapshots: (typeof priceSnapshots.$inferInsert)[] = [];
  for (let d = 30; d >= 0; d--) {
    const t = new Date(now - d * 86_400_000);
    const noise = (Math.sin(d / 3) * 4).toFixed(2);
    snapshots.push({
      orgId: ORG_ID,
      competitorProductId: COMP_PROD_A,
      scrapedAt: t,
      price: (210 - d * 0.5 + Number(noise)).toFixed(2),
      currency: 'EUR',
      availability: 'in_stock',
      status: 'ok',
      source: 'manual',
      sourcePath: 'seed',
      confidence: '0.95',
    });
    snapshots.push({
      orgId: ORG_ID,
      competitorProductId: COMP_PROD_B,
      scrapedAt: t,
      price: (175 + Number(noise)).toFixed(2),
      currency: 'GBP',
      availability: d < 5 ? 'out_of_stock' : 'in_stock',
      status: 'ok',
      source: 'manual',
      sourcePath: 'seed',
      confidence: '0.9',
    });
  }
  // Avoid duplicate-on-rerun by deleting prior seed-source rows first.
  await db.execute(drizzleSql`
    delete from price_snapshots
    where org_id = ${ORG_ID} and source = 'manual' and source_path = 'seed'
  `);
  await db.insert(priceSnapshots).values(snapshots);

  await db
    .insert(alertRules)
    .values({
      id: ALERT_ID,
      orgId: ORG_ID,
      name: 'Competitor cheaper than my HP-2000',
      type: 'competitor_cheaper_than_me',
      params: { thresholdPct: 0 },
      scopeMyProductId: MY_PROD_ID,
      channels: ['in_app', 'email'],
      active: true,
    })
    .onConflictDoNothing();

  await client.end();
  console.log('Seed complete.');
  console.log('Demo org:', { ORG_ID, slug: 'demo' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
