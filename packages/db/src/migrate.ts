import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql);
  console.log('Applying migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
