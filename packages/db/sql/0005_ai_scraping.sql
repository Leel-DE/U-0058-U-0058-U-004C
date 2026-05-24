create table if not exists ai_extraction_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid references stores(id) on delete cascade,
  url text not null,
  cleaned_dom_hash text not null,
  suggested_rules_json jsonb not null,
  confidence numeric(4, 3),
  status text not null default 'suggested',
  created_at timestamptz not null default now()
);

create index if not exists ai_extraction_suggestions_org_idx on ai_extraction_suggestions(organization_id);
create index if not exists ai_extraction_suggestions_hash_idx on ai_extraction_suggestions(cleaned_dom_hash);

create table if not exists manual_scraping_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid references stores(id) on delete cascade,
  url text not null,
  status text not null default 'waiting_for_manual_action',
  logs jsonb not null default '[]'::jsonb,
  storage_state text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists manual_scraping_sessions_org_idx on manual_scraping_sessions(organization_id);
create index if not exists manual_scraping_sessions_status_idx on manual_scraping_sessions(status);

create table if not exists domain_sessions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  storage_state text not null,
  cookies_hash text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now()
);

create index if not exists domain_sessions_domain_idx on domain_sessions(domain);

create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  latency_ms integer,
  token_estimate integer,
  success boolean not null default false,
  confidence numeric(4, 3),
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_logs_created_at_idx on ai_logs(created_at);
