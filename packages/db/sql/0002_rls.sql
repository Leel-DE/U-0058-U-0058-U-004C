-- Row Level Security — all org-scoped tables.
-- Pattern: SELECT for any member, INSERT/UPDATE for owner+manager, DELETE for owner.
-- Service role (used by the worker callback) bypasses RLS, so we always
-- also filter by org_id in application code.

-- =====================================================================
-- Helper: is_member / is_role
-- =====================================================================
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles org_role[])
returns boolean language sql stable as $$
  select exists(
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = any(p_roles)
  );
$$;

-- =====================================================================
-- profiles — readable by anyone who shares an org; writable by self
-- =====================================================================
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists(
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- =====================================================================
-- organizations
-- =====================================================================
alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations for insert
  with check (auth.uid() is not null);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update
  using (public.has_org_role(id, array['owner','manager']::org_role[]))
  with check (public.has_org_role(id, array['owner','manager']::org_role[]));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations for delete
  using (public.has_org_role(id, array['owner']::org_role[]));

-- =====================================================================
-- memberships
-- =====================================================================
alter table public.memberships enable row level security;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (public.is_org_member(org_id) or user_id = auth.uid());

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert
  with check (
    -- bootstrap: the org creator inserts themselves as owner
    user_id = auth.uid()
    or public.has_org_role(org_id, array['owner']::org_role[])
  );

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update
  using (public.has_org_role(org_id, array['owner']::org_role[]));

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete
  using (public.has_org_role(org_id, array['owner']::org_role[]) or user_id = auth.uid());

-- =====================================================================
-- Generic policy generator for org-scoped tables
-- =====================================================================
do $$
declare
  tbl text;
  org_scoped text[] := array[
    'invitations',
    'categories', 'tags',
    'stores', 'scraping_rules',
    'my_products', 'competitor_products',
    'scrape_runs', 'price_snapshots',
    'product_matches',
    'alert_rules', 'notifications',
    'exports', 'audit_logs'
  ];
begin
  foreach tbl in array org_scoped loop
    execute format('alter table public.%I enable row level security;', tbl);

    execute format('drop policy if exists %I_select on public.%I;', tbl, tbl);
    execute format('drop policy if exists %I_insert on public.%I;', tbl, tbl);
    execute format('drop policy if exists %I_update on public.%I;', tbl, tbl);
    execute format('drop policy if exists %I_delete on public.%I;', tbl, tbl);

    if tbl = 'scraping_rules' then
      -- scraping_rules has no org_id directly; bridge through stores
      execute $sql$
        create policy scraping_rules_select on public.scraping_rules for select
          using (exists(select 1 from public.stores s
                        where s.id = scraping_rules.store_id
                          and public.is_org_member(s.org_id)));
        create policy scraping_rules_write on public.scraping_rules for all
          using (exists(select 1 from public.stores s
                        where s.id = scraping_rules.store_id
                          and public.has_org_role(s.org_id, array['owner','manager']::org_role[])))
          with check (exists(select 1 from public.stores s
                        where s.id = scraping_rules.store_id
                          and public.has_org_role(s.org_id, array['owner','manager']::org_role[])));
      $sql$;
    else
      execute format(
        'create policy %I_select on public.%I for select
           using (public.is_org_member(org_id));',
        tbl, tbl);

      execute format(
        'create policy %I_insert on public.%I for insert
           with check (public.has_org_role(org_id, array[''owner'',''manager'']::org_role[]));',
        tbl, tbl);

      execute format(
        'create policy %I_update on public.%I for update
           using (public.has_org_role(org_id, array[''owner'',''manager'']::org_role[]))
           with check (public.has_org_role(org_id, array[''owner'',''manager'']::org_role[]));',
        tbl, tbl);

      execute format(
        'create policy %I_delete on public.%I for delete
           using (public.has_org_role(org_id, array[''owner'']::org_role[]));',
        tbl, tbl);
    end if;
  end loop;
end $$;

-- Notifications: a user can also read their own notifications regardless of role
drop policy if exists notifications_user_select on public.notifications;
create policy notifications_user_select on public.notifications for select
  using (user_id = auth.uid() or public.is_org_member(org_id));

drop policy if exists notifications_user_update on public.notifications;
create policy notifications_user_update on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
