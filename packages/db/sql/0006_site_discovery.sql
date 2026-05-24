create table if not exists site_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid not null references stores(id) on delete cascade,
  status text not null default 'queued',
  start_url text not null,
  max_pages integer not null default 300,
  max_products integer not null default 1000,
  crawl_depth integer not null default 4,
  mode text not null default 'category_scan',
  use_ai boolean not null default false,
  use_manual_captcha boolean not null default true,
  respect_robots_txt boolean not null default true,
  include_patterns jsonb not null default '[]'::jsonb,
  exclude_patterns jsonb not null default '[]'::jsonb,
  pages_discovered integer not null default 0,
  pages_crawled integer not null default 0,
  categories_found integer not null default 0,
  products_found integer not null default 0,
  errors_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references profiles(id) on delete set null
);

create index if not exists site_discovery_runs_org_created_idx on site_discovery_runs(organization_id, started_at);
create index if not exists site_discovery_runs_competitor_idx on site_discovery_runs(competitor_id);

create table if not exists site_discovery_pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references site_discovery_runs(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  canonical_url text,
  page_type text not null,
  status text not null,
  http_status integer,
  depth integer not null default 0,
  parent_url text,
  title text,
  h1 text,
  confidence numeric(4, 3),
  discovered_from text,
  crawled_at timestamptz,
  error text
);

create unique index if not exists site_discovery_pages_run_url_unique on site_discovery_pages(run_id, normalized_url);
create index if not exists site_discovery_pages_run_type_idx on site_discovery_pages(run_id, page_type);

create table if not exists site_discovery_categories (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references site_discovery_runs(id) on delete cascade,
  competitor_id uuid not null references stores(id) on delete cascade,
  url text not null,
  name text not null,
  path text,
  breadcrumbs jsonb not null default '[]'::jsonb,
  product_count_estimate integer,
  products_found integer not null default 0,
  pagination_pages_found integer not null default 0,
  confidence numeric(4, 3),
  source text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists site_discovery_categories_run_url_unique on site_discovery_categories(run_id, url);
create index if not exists site_discovery_categories_run_idx on site_discovery_categories(run_id);

create table if not exists site_discovery_products (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references site_discovery_runs(id) on delete cascade,
  competitor_id uuid not null references stores(id) on delete cascade,
  category_id uuid references site_discovery_categories(id) on delete set null,
  url text not null,
  normalized_url text not null,
  title text,
  price numeric(12, 2),
  old_price numeric(12, 2),
  currency text,
  availability text,
  image_url text,
  brand text,
  sku text,
  ean text,
  gtin text,
  rating numeric(3, 2),
  shipping text,
  category_path text,
  breadcrumbs jsonb not null default '[]'::jsonb,
  raw_card_json jsonb,
  raw_detail_json jsonb,
  confidence numeric(4, 3),
  source text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists site_discovery_products_run_url_unique on site_discovery_products(run_id, normalized_url);
create index if not exists site_discovery_products_run_idx on site_discovery_products(run_id);
create index if not exists site_discovery_products_sku_idx on site_discovery_products(run_id, sku);
create index if not exists site_discovery_products_gtin_idx on site_discovery_products(run_id, gtin);

create table if not exists site_discovery_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references site_discovery_runs(id) on delete cascade,
  level text not null,
  message text not null,
  context_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists site_discovery_logs_run_created_idx on site_discovery_logs(run_id, created_at);
