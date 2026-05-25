import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '../sql');

interface SqlFile {
  fullPath: string;
  relativePath: string;
}

async function listSqlFiles(dir: string, root = dir): Promise<SqlFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: SqlFile[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSqlFiles(fullPath, root)));
    } else if (entry.isFile() && entry.name.endsWith('.sql')) {
      files.push({
        fullPath,
        relativePath: path.relative(root, fullPath).replace(/\\/g, '/'),
      });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function sha256(body: string) {
  return createHash('sha256').update(body).digest('hex');
}

async function ensureMetadata(sql: postgres.Sql) {
  await sql`create extension if not exists "uuid-ossp"`;
  await sql`
    create table if not exists public.schema_migration_log (
      id uuid primary key default uuid_generate_v4(),
      path text not null unique,
      hash text not null,
      kind text not null default 'raw_sql',
      applied_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists public.schema_verification_snapshots (
      id uuid primary key default uuid_generate_v4(),
      snapshot_hash text not null,
      snapshot_json jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await ensureMetadata(sql);
    const files = await listSqlFiles(sqlDir);
    for (const file of files) {
      const body = await readFile(file.fullPath, 'utf8');
      const hash = sha256(body);
      const rows = await sql<{ hash: string }[]>`
        select hash from public.schema_migration_log where path = ${file.relativePath}
      `;
      if (rows[0]?.hash === hash) {
        console.log(`- raw SQL unchanged: ${file.relativePath}`);
        continue;
      }

      console.log(`> applying raw SQL ${file.relativePath}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          insert into public.schema_migration_log (path, hash, kind, applied_at)
          values (${file.relativePath}, ${hash}, 'raw_sql', now())
          on conflict (path) do update
          set hash = excluded.hash,
              kind = excluded.kind,
              applied_at = excluded.applied_at
        `;
      });
      console.log(`  ok ${file.relativePath}`);
    }
    console.log('Raw SQL applied.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
