create table if not exists analytics_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  bucket_date date not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists analytics_daily_rollups_org_date_unique
  on analytics_daily_rollups(org_id, bucket_date);

create table if not exists competitor_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid not null references stores(id) on delete cascade,
  bucket_date date not null,
  products_count integer not null default 0,
  avg_price numeric(12,2),
  avg_discount numeric(8,2),
  aggressiveness_score numeric(6,2) not null default 0,
  data_quality_score numeric(6,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists competitor_daily_rollups_competitor_date_unique
  on competitor_daily_rollups(competitor_id, bucket_date);
create index if not exists competitor_daily_rollups_org_date_idx
  on competitor_daily_rollups(org_id, bucket_date);

create table if not exists category_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  category_name text not null,
  bucket_date date not null,
  products_count integer not null default 0,
  avg_price numeric(12,2),
  volatility_score numeric(6,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists category_daily_rollups_category_date_unique
  on category_daily_rollups(org_id, category_name, bucket_date);
create index if not exists category_daily_rollups_org_date_idx
  on category_daily_rollups(org_id, bucket_date);

create table if not exists product_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  product_id uuid references my_products(id) on delete cascade,
  entity_key text not null,
  bucket_date date not null,
  min_price numeric(12,2),
  avg_price numeric(12,2),
  max_price numeric(12,2),
  stock_ratio numeric(6,3),
  volatility_score numeric(6,2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists product_daily_rollups_product_date_unique
  on product_daily_rollups(org_id, entity_key, bucket_date);
create index if not exists product_daily_rollups_org_date_idx
  on product_daily_rollups(org_id, bucket_date);
