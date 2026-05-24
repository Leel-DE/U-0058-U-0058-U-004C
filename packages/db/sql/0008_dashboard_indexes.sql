create index if not exists competitor_products_org_active_idx
  on competitor_products(org_id, active);

create index if not exists competitor_products_org_last_scraped_idx
  on competitor_products(org_id, last_scraped_at);

create index if not exists my_products_org_category_idx
  on my_products(org_id, category_id);

create index if not exists product_matches_competitor_product_idx
  on product_matches(competitor_product_id);

create index if not exists scrape_runs_org_status_created_idx
  on scrape_runs(org_id, status, created_at);

create index if not exists price_snapshots_org_status_time_idx
  on price_snapshots(org_id, status, scraped_at);

create index if not exists site_discovery_runs_org_status_created_idx
  on site_discovery_runs(organization_id, status, started_at);

create index if not exists manual_scraping_sessions_org_status_created_idx
  on manual_scraping_sessions(organization_id, status, created_at);
