import postgres from 'postgres';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 5 });

try {
  const rows = await sql<{ now: Date }[]>`select now()`;
  console.log(`DB connection ok: ${rows[0]?.now?.toISOString?.() ?? 'connected'}`);
} finally {
  await sql.end();
}
