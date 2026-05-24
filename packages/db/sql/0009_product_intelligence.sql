create table if not exists normalized_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  canonical_title text not null,
  normalized_key text not null,
  brand text,
  category_id uuid references categories(id) on delete set null,
  image_url text,
  confidence numeric(4,3) not null default 0.750,
  source text not null default 'heuristic',
  manually_reviewed boolean not null default false,
  duplicate_of_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists normalized_products_org_key_unique
  on normalized_products(org_id, normalized_key);
create index if not exists normalized_products_org_brand_idx
  on normalized_products(org_id, brand);
create index if not exists normalized_products_org_category_idx
  on normalized_products(org_id, category_id);
create index if not exists normalized_products_org_updated_idx
  on normalized_products(org_id, updated_at);

create table if not exists normalized_product_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  normalized_product_id uuid not null references normalized_products(id) on delete cascade,
  alias text not null,
  alias_key text not null,
  source text not null default 'heuristic',
  confidence numeric(4,3) not null default 0.750,
  created_at timestamptz not null default now()
);

create unique index if not exists normalized_product_aliases_org_alias_unique
  on normalized_product_aliases(org_id, alias_key);
create index if not exists normalized_product_aliases_product_idx
  on normalized_product_aliases(normalized_product_id);

create table if not exists product_specifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  normalized_product_id uuid not null references normalized_products(id) on delete cascade,
  brand text,
  model text,
  year integer,
  motor text,
  battery text,
  battery_wh integer,
  fork text,
  rear_shock text,
  drivetrain text,
  brakes text,
  wheels text,
  wheel_size text,
  frame_material text,
  weight_kg numeric(6,2),
  travel_mm integer,
  color text,
  size text,
  gender text,
  bike_type text,
  raw_specs jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.650,
  source text not null default 'heuristic',
  updated_at timestamptz not null default now()
);

create unique index if not exists product_specifications_product_unique
  on product_specifications(normalized_product_id);
create index if not exists product_specifications_org_battery_idx
  on product_specifications(org_id, battery_wh);
create index if not exists product_specifications_org_wheel_idx
  on product_specifications(org_id, wheel_size);

create table if not exists product_price_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  normalized_product_id uuid not null references normalized_products(id) on delete cascade,
  bucket_date date not null,
  min_price numeric(12,2),
  avg_price numeric(12,2),
  max_price numeric(12,2),
  currency text,
  competitors_count integer not null default 0,
  volatility_score numeric(8,3) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists product_price_history_product_date_unique
  on product_price_history(normalized_product_id, bucket_date);
create index if not exists product_price_history_org_date_idx
  on product_price_history(org_id, bucket_date);

create table if not exists product_availability_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  normalized_product_id uuid not null references normalized_products(id) on delete cascade,
  bucket_date date not null,
  in_stock_count integer not null default 0,
  out_of_stock_count integer not null default 0,
  unknown_count integer not null default 0,
  stock_ratio numeric(6,3) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists product_availability_history_product_date_unique
  on product_availability_history(normalized_product_id, bucket_date);
create index if not exists product_availability_history_org_date_idx
  on product_availability_history(org_id, bucket_date);

create table if not exists product_matching_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  normalized_product_id uuid references normalized_products(id) on delete set null,
  my_product_id uuid references my_products(id) on delete set null,
  competitor_product_id uuid references competitor_products(id) on delete set null,
  action text not null,
  method text not null,
  score numeric(5,3),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_matching_logs_org_created_idx
  on product_matching_logs(org_id, created_at);
create index if not exists product_matching_logs_competitor_idx
  on product_matching_logs(competitor_product_id);

create table if not exists product_insights_cache (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  insight_type text not null,
  entity_id text,
  severity text not null default 'info',
  title text not null,
  details jsonb not null default '{}'::jsonb,
  metric_value numeric(14,4),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists product_insights_cache_org_type_idx
  on product_insights_cache(org_id, insight_type);
create index if not exists product_insights_cache_org_severity_idx
  on product_insights_cache(org_id, severity);

alter type export_kind add value if not exists 'product_intelligence_csv';
alter type export_kind add value if not exists 'product_intelligence_json';
alter type export_kind add value if not exists 'product_history_csv';
