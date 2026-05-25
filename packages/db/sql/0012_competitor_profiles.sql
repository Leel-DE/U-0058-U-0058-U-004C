create table if not exists competitor_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  framework text,
  rendering_strategy text,
  scrape_difficulty text,
  anti_bot_risk text,
  recommended_mode text,
  detection_confidence numeric(5,4),
  auto_detected_settings_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists competitor_profiles_store_unique on competitor_profiles(store_id);
create index if not exists competitor_profiles_framework_idx on competitor_profiles(framework);

alter table competitor_profiles enable row level security;

drop policy if exists competitor_profiles_select on competitor_profiles;
create policy competitor_profiles_select on competitor_profiles
  for select
  using (
    exists (
      select 1
      from stores s
      join memberships m on m.org_id = s.org_id
      where s.id = competitor_profiles.store_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists competitor_profiles_modify on competitor_profiles;
create policy competitor_profiles_modify on competitor_profiles
  for all
  using (
    exists (
      select 1
      from stores s
      join memberships m on m.org_id = s.org_id
      where s.id = competitor_profiles.store_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1
      from stores s
      join memberships m on m.org_id = s.org_id
      where s.id = competitor_profiles.store_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  );
