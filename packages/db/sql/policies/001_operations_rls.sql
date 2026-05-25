-- RLS for hardening/debug tables. Drizzle owns the table shape; raw SQL owns access control.
alter table public.selector_versions enable row level security;
alter table public.extraction_debug_artifacts enable row level security;
alter table public.crawl_domain_health enable row level security;

drop policy if exists selector_versions_select on public.selector_versions;
create policy selector_versions_select on public.selector_versions for select
  using (
    exists (
      select 1
      from public.stores s
      where s.id = selector_versions.store_id
        and public.is_org_member(s.org_id)
    )
  );

drop policy if exists selector_versions_write on public.selector_versions;
create policy selector_versions_write on public.selector_versions for all
  using (
    exists (
      select 1
      from public.stores s
      where s.id = selector_versions.store_id
        and public.has_org_role(s.org_id, array['owner','manager']::org_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = selector_versions.store_id
        and public.has_org_role(s.org_id, array['owner','manager']::org_role[])
    )
  );

drop policy if exists extraction_debug_artifacts_select on public.extraction_debug_artifacts;
create policy extraction_debug_artifacts_select on public.extraction_debug_artifacts for select
  using (public.is_org_member(organization_id));

drop policy if exists extraction_debug_artifacts_write on public.extraction_debug_artifacts;
create policy extraction_debug_artifacts_write on public.extraction_debug_artifacts for all
  using (public.has_org_role(organization_id, array['owner','manager']::org_role[]))
  with check (public.has_org_role(organization_id, array['owner','manager']::org_role[]));

drop policy if exists crawl_domain_health_select on public.crawl_domain_health;
create policy crawl_domain_health_select on public.crawl_domain_health for select
  using (public.is_org_member(organization_id));

drop policy if exists crawl_domain_health_write on public.crawl_domain_health;
create policy crawl_domain_health_write on public.crawl_domain_health for all
  using (public.has_org_role(organization_id, array['owner','manager']::org_role[]))
  with check (public.has_org_role(organization_id, array['owner','manager']::org_role[]));
