import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cr/db/schema';
import { serverEnv } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __cr_pg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __cr_drizzle: PostgresJsDatabase<typeof schema> | undefined;
}

function getClient() {
  if (!global.__cr_pg) {
    const env = serverEnv();
    global.__cr_pg = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return global.__cr_pg;
}

export function db(): PostgresJsDatabase<typeof schema> {
  if (!global.__cr_drizzle) {
    global.__cr_drizzle = drizzle(getClient(), { schema });
  }
  return global.__cr_drizzle;
}

export { schema };
