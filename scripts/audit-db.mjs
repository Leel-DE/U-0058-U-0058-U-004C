/**
 * Audit helper: spin up an embedded Postgres, run db:push + db:seed,
 * and run smoke queries to verify schema/RLS/seed all land.
 * Used only for `pnpm audit:db` (not part of normal scripts).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.cache', 'pg-data');

if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'audit',
  password: 'audit',
  port: 55432,
  persistent: false,
});

console.log('▶ initializing embedded postgres…');
await pg.initialise();
console.log('▶ starting embedded postgres on :55432…');
await pg.start();
await pg.createDatabase('competitor_radar');

const DB = 'postgresql://audit:audit@localhost:55432/competitor_radar';

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: DB, DIRECT_URL: DB },
  });
}

try {
  run('pnpm --filter @cr/db exec drizzle-kit push --force');
  run('pnpm --filter @cr/db exec tsx src/apply-sql.ts');
  run('pnpm --filter @cr/db exec tsx src/seed.ts');

  // Smoke-query: did seed actually land?
  const { Client } = await import('pg');
  const client = new Client({ connectionString: DB });
  await client.connect();
  const checks = [
    `select count(*)::int as n from organizations`,
    `select count(*)::int as n from stores`,
    `select count(*)::int as n from competitor_products`,
    `select count(*)::int as n from price_snapshots`,
    `select count(*)::int as n from alert_rules`,
    `select count(*)::int as n from pg_policies where schemaname = 'public'`,
  ];
  console.log('\n▶ smoke queries:');
  for (const q of checks) {
    const r = await client.query(q);
    console.log(`  ${q.replace(/select count\(\*\)::int as n from /, '').padEnd(45)} → ${r.rows[0].n}`);
  }
  await client.end();
  console.log('\n✓ db audit complete');
} finally {
  await pg.stop();
}
