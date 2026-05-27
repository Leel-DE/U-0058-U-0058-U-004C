create table if not exists selector_repair_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid references stores(id) on delete cascade,
  product_id uuid references competitor_products(id) on delete cascade,
  scrape_run_id uuid references scrape_runs(id) on delete set null,
  scraping_rule_id uuid references scraping_rules(id) on delete set null,
  debug_artifact_id uuid references extraction_debug_artifacts(id) on delete set null,
  status text not null default 'pending',
  trigger_reason text not null,
  old_selectors_json jsonb not null default '{}'::jsonb,
  suggested_selectors_json jsonb,
  validation_result_json jsonb,
  applied_selectors_json jsonb,
  retry_result_json jsonb,
  ai_provider text,
  ai_model text,
  confidence numeric(4, 3),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists selector_repair_attempts_org_idx on selector_repair_attempts(organization_id);
create index if not exists selector_repair_attempts_competitor_idx on selector_repair_attempts(competitor_id);
create index if not exists selector_repair_attempts_product_idx on selector_repair_attempts(product_id);
create index if not exists selector_repair_attempts_status_idx on selector_repair_attempts(status);
create index if not exists selector_repair_attempts_created_idx on selector_repair_attempts(created_at);
