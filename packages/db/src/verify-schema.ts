import 'dotenv/config';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

type CheckStatus = 'pass' | 'fail' | 'skip';

interface Check {
  name: string;
  status: CheckStatus;
  detail?: string;
}

const REQUIRED_TABLES = [
  'organizations',
  'memberships',
  'stores',
  'scraping_rules',
  'competitor_products',
  'price_snapshots',
  'scrape_runs',
  'site_discovery_runs',
  'site_discovery_products',
  'selector_versions',
  'extraction_debug_artifacts',
  'crawl_domain_health',
  'service_heartbeats',
  'schema_migration_log',
  'schema_verification_snapshots',
];

const REQUIRED_INDEXES = [
  'stores_org_domain_unique',
  'price_snapshots_org_status_time_idx',
  'site_discovery_products_run_url_unique',
  'selector_versions_store_type_version_unique',
  'extraction_debug_artifacts_org_created_idx',
  'crawl_domain_health_org_domain_unique',
  'service_heartbeats_service_instance_unique',
];

const REQUIRED_VIEWS = ['v_latest_snapshot', 'v_org_dashboard', 'v_price_movers'];
const REQUIRED_RLS_TABLES = [
  'profiles',
  'organizations',
  'memberships',
  'stores',
  'competitor_products',
  'price_snapshots',
  'alert_rules',
  'notifications',
  'selector_versions',
  'extraction_debug_artifacts',
  'crawl_domain_health',
];
const REQUIRED_POLICIES = [
  'profiles_select',
  'organizations_select',
  'memberships_select',
  'stores_select',
  'competitor_products_select',
  'price_snapshots_select',
  'alert_rules_select',
  'notifications_user_select',
  'selector_versions_select',
  'extraction_debug_artifacts_select',
  'crawl_domain_health_select',
];
const REQUIRED_BUCKETS = ['exports', 'raw-html', 'screenshots', 'html', 'debug'];

function hashSnapshot(snapshot: unknown) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function checkIncludes(name: string, actual: string[], expected: string[]): Check {
  const missing = expected.filter((item) => !actual.includes(item));
  return missing.length
    ? { name, status: 'fail', detail: `missing: ${missing.join(', ')}` }
    : { name, status: 'pass', detail: `${expected.length} required item(s)` };
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL is required');

  const sql = postgres(url, { prepare: false, max: 1 });
  const checks: Check[] = [];

  try {
    const tableRows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `;
    const tables = tableRows.map((row) => row.table_name);
    checks.push(checkIncludes('tables', tables, REQUIRED_TABLES));

    const indexRows = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes where schemaname = 'public'
    `;
    const indexes = indexRows.map((row) => row.indexname);
    checks.push(checkIncludes('indexes', indexes, REQUIRED_INDEXES));

    const viewRows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.views
      where table_schema = 'public'
    `;
    const views = viewRows.map((row) => row.table_name);
    checks.push(checkIncludes('views', views, REQUIRED_VIEWS));

    const rlsRows = await sql<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relrowsecurity = true
    `;
    const rlsTables = rlsRows.map((row) => row.relname);
    checks.push(checkIncludes('rls', rlsTables, REQUIRED_RLS_TABLES));

    const policyRows = await sql<{ policyname: string }[]>`
      select policyname from pg_policies where schemaname = 'public'
    `;
    const policies = policyRows.map((row) => row.policyname);
    checks.push(checkIncludes('policies', policies, REQUIRED_POLICIES));

    const triggerRows = await sql<{ tgname: string; table_name: string }[]>`
      select t.tgname, c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
    `;
    const triggerTargets = triggerRows.map((row) => `${row.table_name}.${row.tgname}`);
    checks.push(
      checkIncludes('triggers', triggerTargets, [
        'organizations.trg_updated_at',
        'stores.trg_updated_at',
        'my_products.trg_updated_at',
        'scraping_rules.trg_updated_at',
      ]),
    );

    const storageExists = await sql<{ exists: boolean }[]>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'storage' and table_name = 'buckets'
      )
    `;
    let buckets: string[] = [];
    if (storageExists[0]?.exists) {
      const bucketRows = await sql<{ id: string }[]>`select id from storage.buckets`;
      buckets = bucketRows.map((row) => row.id);
      checks.push(checkIncludes('storage_buckets', buckets, REQUIRED_BUCKETS));
    } else {
      checks.push({ name: 'storage_buckets', status: 'skip', detail: 'storage schema not present' });
    }

    const rawSqlRows = await sql<{ path: string; hash: string; applied_at: string }[]>`
      select path, hash, applied_at::text
      from public.schema_migration_log
      order by path
    `;
    checks.push(
      rawSqlRows.length > 0
        ? { name: 'raw_sql_metadata', status: 'pass', detail: `${rawSqlRows.length} file hash(es)` }
        : { name: 'raw_sql_metadata', status: 'fail', detail: 'no raw SQL hashes recorded' },
    );

    const snapshot = {
      tables: tables.sort(),
      indexes: indexes.sort(),
      views: views.sort(),
      rlsTables: rlsTables.sort(),
      policies: policies.sort(),
      triggers: triggerTargets.sort(),
      buckets: buckets.sort(),
      rawSql: rawSqlRows,
    };
    const snapshotHash = hashSnapshot(snapshot);
    await sql`
      insert into public.schema_verification_snapshots (snapshot_hash, snapshot_json)
      values (${snapshotHash}, ${JSON.stringify(snapshot)}::jsonb)
    `;
    checks.push({ name: 'schema_snapshot', status: 'pass', detail: snapshotHash });

    const failed = checks.filter((check) => check.status === 'fail');
    for (const check of checks) {
      const marker = check.status === 'pass' ? 'ok' : check.status === 'skip' ? '--' : 'fail';
      console.log(`${marker} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
    }
    if (failed.length) {
      console.error(`Schema verification failed (${failed.length} check(s)).`);
      process.exit(1);
    }
    console.log('Schema verification passed.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
