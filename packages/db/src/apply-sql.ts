// Applies the raw SQL files in packages/db/sql in lexical order.
// Run after `drizzle-kit push` to set up extensions, triggers, RLS, views, and storage buckets.
import 'dotenv/config';
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '../sql');

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

  const sql = postgres(url, { prepare: false, max: 1 });

  const files = (await readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const full = path.join(sqlDir, file);
    const body = await readFile(full, 'utf8');
    console.log(`▶ applying ${file}`);
    await sql.unsafe(body);
    console.log(`  ✓ ${file}`);
  }
  await sql.end();
  console.log('All SQL applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
