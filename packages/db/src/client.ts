// Drizzle client placeholder for Phase 0. Real schema lands in Phase 1.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let _client: PostgresJsDatabase | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): PostgresJsDatabase {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  _sql = postgres(url, { prepare: false, max: 5 });
  _client = drizzle(_sql);
  return _client;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _client = null;
  }
}
