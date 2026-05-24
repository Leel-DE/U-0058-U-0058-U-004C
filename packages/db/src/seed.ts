// Seeds a demo organization with stores, products, snapshots, alert rule —
// and optionally a super-admin user (Supabase Auth + owner membership)
// when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SEED_ADMIN_* are set.
// Idempotent: deterministic IDs + onConflictDoNothing/Update everywhere.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import {
  organizations,
  stores,
  scrapingRules,
  myProducts,
  competitorProducts,
  priceSnapshots,
  alertRules,
  categories,
  profiles,
  memberships,
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

type Db = ReturnType<typeof drizzle>;

/**
 * Try to create (or look up) a Supabase Auth user and attach them as owner
 * of the demo org. Returns the user id if successful, null otherwise.
 */
async function provisionSuperAdmin(db: Db): Promise<string | null> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin!2026';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log(
      '⚠  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping super-admin creation.',
    );
    console.log('   (Local Postgres-only seed: the demo org exists but has no owner yet.)');
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`▶ ensuring auth user ${email} exists …`);
  let userId: string | null = null;

  // Try create. If the user already exists, list and find them.
  const create = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Admin' },
  });

  if (create.error) {
    const msg = create.error.message.toLowerCase();
    if (
      msg.includes('already registered') ||
      msg.includes('already been registered') ||
      msg.includes('user already exists') ||
      msg.includes('duplicate')
    ) {
      console.log('  user already exists — looking up id …');
      // Paginate up to 10 pages of 1000 to find by email
      for (let page = 1; page <= 10 && !userId; page++) {
        const list = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (list.error) {
          console.error('  listUsers failed:', list.error.message);
          break;
        }
        const found = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) {
          userId = found.id;
          // Rotate password to match .env so the operator can always log in
          const upd = await supabase.auth.admin.updateUserById(found.id, {
            password,
            email_confirm: true,
          });
          if (upd.error) {
            console.warn('  password update failed:', upd.error.message);
          } else {
            console.log('  password reset to SEED_ADMIN_PASSWORD');
          }
        }
        if (list.data.users.length < 1000) break;
      }
    } else {
      console.error('  createUser failed:', create.error.message);
      return null;
    }
  } else {
    userId = create.data.user?.id ?? null;
    console.log('  created auth user', userId);
  }

  if (!userId) {
    console.warn('  could not resolve user id; skipping membership.');
    return null;
  }

  // Ensure profile row exists (the on_auth_user_created trigger does this on
  // Supabase, but we also call it here for defence-in-depth and for bare PG).
  await db
    .insert(profiles)
    .values({ id: userId, email, fullName: 'Demo Admin' })
    .onConflictDoNothing();

  // Attach as owner of the demo org.
  await db
    .insert(memberships)
    .values({ orgId: ORG_ID, userId, role: 'owner' })
    .onConflictDoUpdate({
      target: [memberships.orgId, memberships.userId],
      set: { role: 'owner' },
    });

  return userId;
}

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
        domain: 'example-electronics.local',
        countryCode: 'DE',
        currency: 'EUR',
        crawlFrequencyMinutes: 1440,
        crawlDelaySeconds: 5,
      },
      {
        id: STORE_B_ID,
        orgId: ORG_ID,
        name: 'Acme Audio',
        domain: 'acme-audio.local',
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

  const urlA = 'http://127.0.0.1:4000/fixtures/example-electronics/acme-hp-2000';
  const urlB = 'http://127.0.0.1:4000/fixtures/acme-audio/hp-2000';
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

  // Super-admin (Supabase Auth → owner of demo org). Skipped silently if
  // SUPABASE_URL/SERVICE_ROLE_KEY are missing (e.g. local Postgres-only audit run).
  const adminId = await provisionSuperAdmin(db);

  await client.end();

  console.log('\n✓ Seed complete.\n');
  console.log('  Demo org id :', ORG_ID);
  console.log('  Demo org slug: demo');
  if (adminId) {
    const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.local';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin!2026';
    console.log('\n  Super-admin credentials (also in your .env.local):');
    console.log(`    email   : ${email}`);
    console.log(`    password: ${password}`);
    console.log(`    user id : ${adminId}`);
    console.log('  Sign in at http://localhost:3000/login');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
