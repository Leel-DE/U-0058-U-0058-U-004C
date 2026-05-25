import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { getSystemHealth } from './health';

interface PackageJson {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface OrgCounts extends Record<string, unknown> {
  stores: number;
  active_stores: number;
  competitor_products: number;
  active_competitor_products: number;
  price_snapshots: number;
  scrape_runs: number;
  discovery_runs: number;
  extraction_artifacts: number;
  selector_versions: number;
  crawl_domains: number;
}

interface DbInfo extends Record<string, unknown> {
  database_name: string;
  server_version: string;
  database_size: string;
  public_tables: number;
  rls_tables: number;
  policies: number;
  views: number;
  indexes: number;
}

export interface MigrationLogRow extends Record<string, unknown> {
  path: string;
  hash: string;
  applied_at: string;
}

export interface TableStatRow extends Record<string, unknown> {
  table_name: string;
  estimated_rows: number;
  total_size: string;
  index_size: string;
  last_vacuum: string | null;
  last_analyze: string | null;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findWorkspaceRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (await fileExists(candidate)) {
      const parsed = JSON.parse(await readFile(candidate, 'utf8')) as PackageJson;
      if (parsed.name === 'competitor-radar') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function readPackageJson(filePath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function depVersion(pkg: PackageJson | null, name: string) {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? null;
}

async function loadPackageInfo() {
  const root = await findWorkspaceRoot();
  const [rootPkg, webPkg, workerPkg, dbPkg, sharedPkg] = await Promise.all([
    readPackageJson(path.join(root, 'package.json')),
    readPackageJson(path.join(root, 'apps/web/package.json')),
    readPackageJson(path.join(root, 'apps/worker/package.json')),
    readPackageJson(path.join(root, 'packages/db/package.json')),
    readPackageJson(path.join(root, 'packages/shared/package.json')),
  ]);

  return {
    root,
    project: {
      name: rootPkg?.name ?? 'unknown',
      version: rootPkg?.version ?? 'unknown',
      packageManager: rootPkg?.packageManager ?? 'unknown',
      node: process.version,
      next: depVersion(webPkg, 'next'),
      react: depVersion(webPkg, 'react'),
      typescript: depVersion(rootPkg, 'typescript') ?? depVersion(webPkg, 'typescript'),
      drizzle: depVersion(dbPkg, 'drizzle-orm'),
      drizzleKit: depVersion(dbPkg, 'drizzle-kit'),
      playwright: depVersion(workerPkg, 'playwright') ?? depVersion(webPkg, '@playwright/test'),
      inngest: depVersion(webPkg, 'inngest'),
      fastify: depVersion(workerPkg, 'fastify'),
    },
    packages: [
      { name: rootPkg?.name ?? 'root', version: rootPkg?.version ?? 'n/a' },
      { name: webPkg?.name ?? '@cr/web', version: webPkg?.version ?? 'n/a' },
      { name: workerPkg?.name ?? '@cr/worker', version: workerPkg?.version ?? 'n/a' },
      { name: dbPkg?.name ?? '@cr/db', version: dbPkg?.version ?? 'n/a' },
      { name: sharedPkg?.name ?? '@cr/shared', version: sharedPkg?.version ?? 'n/a' },
    ],
  };
}

async function loadDbInfo() {
  const [info] = await db().execute<DbInfo>(sql`
    select
      current_database() as database_name,
      current_setting('server_version') as server_version,
      pg_size_pretty(pg_database_size(current_database())) as database_size,
      (select count(*)::int from information_schema.tables where table_schema = 'public') as public_tables,
      (
        select count(*)::int
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relrowsecurity = true
      ) as rls_tables,
      (select count(*)::int from pg_policies where schemaname = 'public') as policies,
      (select count(*)::int from information_schema.views where table_schema = 'public') as views,
      (select count(*)::int from pg_indexes where schemaname = 'public') as indexes
  `);
  return info;
}

async function loadOrgCounts(orgId: string) {
  const [counts] = await db().execute<OrgCounts>(sql`
    select
      (select count(*)::int from stores where org_id = ${orgId}) as stores,
      (select count(*)::int from stores where org_id = ${orgId} and status = 'active') as active_stores,
      (select count(*)::int from competitor_products where org_id = ${orgId}) as competitor_products,
      (select count(*)::int from competitor_products where org_id = ${orgId} and active = true) as active_competitor_products,
      (select count(*)::int from price_snapshots where org_id = ${orgId}) as price_snapshots,
      (select count(*)::int from scrape_runs where org_id = ${orgId}) as scrape_runs,
      (select count(*)::int from site_discovery_runs where organization_id = ${orgId}) as discovery_runs,
      (select count(*)::int from extraction_debug_artifacts where organization_id = ${orgId}) as extraction_artifacts,
      (
        select count(*)::int
        from selector_versions sv
        join stores st on st.id = sv.store_id
        where st.org_id = ${orgId}
      ) as selector_versions,
      (select count(*)::int from crawl_domain_health where organization_id = ${orgId}) as crawl_domains
  `);
  return counts;
}

async function loadSchemaSnapshot() {
  const [snapshot] = await db().execute<{
    snapshot_hash: string;
    created_at: string;
    snapshot_json: unknown;
  }>(sql`
    select snapshot_hash, created_at::text, snapshot_json
    from schema_verification_snapshots
    order by created_at desc
    limit 1
  `);
  return snapshot ?? null;
}

async function loadMigrationLog() {
  return db().execute<MigrationLogRow>(sql`
    select path, hash, applied_at::text
    from schema_migration_log
    order by path
  `);
}

async function loadTableStats() {
  return db().execute<TableStatRow>(sql`
    select
      relname as table_name,
      n_live_tup::int as estimated_rows,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_size_pretty(pg_indexes_size(relid)) as index_size,
      last_vacuum::text,
      last_analyze::text
    from pg_stat_user_tables
    where schemaname = 'public'
    order by pg_total_relation_size(relid) desc
    limit 30
  `);
}

export async function getProjectInfo(orgId: string) {
  const env = serverEnv();
  const [health, packageInfo, dbInfo, orgCounts, schemaSnapshot, migrations, tableStats] =
    await Promise.all([
      getSystemHealth(),
      loadPackageInfo(),
      loadDbInfo(),
      loadOrgCounts(orgId),
      loadSchemaSnapshot(),
      loadMigrationLog(),
      loadTableStats(),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    health,
    packageInfo,
    dbInfo,
    orgCounts,
    schemaSnapshot,
    migrations,
    tableStats,
    config: {
      nodeEnv: env.NODE_ENV,
      localDevMode: env.LOCAL_DEV_MODE,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      workerUrl: env.WORKER_URL,
      workerHost: env.WORKER_HOST ?? null,
      aiConfigured: health.checks.find((check) => check.service === 'ai')?.status === 'ok',
      resendConfigured: Boolean(env.RESEND_API_KEY),
      sentryConfigured: Boolean(env.SENTRY_DSN),
    },
  };
}
