-- Organization-scoped automation policy and queue capacity controls.

insert into public.automation_settings (org_id)
select id from public.organizations
on conflict (org_id) do nothing;

alter table public.automation_settings enable row level security;

create policy automation_settings_select on public.automation_settings for select
  using (public.is_org_member(org_id));
create policy automation_settings_insert on public.automation_settings for insert
  with check (public.has_org_role(org_id, array['owner','manager']::org_role[]));
create policy automation_settings_update on public.automation_settings for update
  using (public.has_org_role(org_id, array['owner','manager']::org_role[]))
  with check (public.has_org_role(org_id, array['owner','manager']::org_role[]));

drop trigger if exists trg_updated_at on public.automation_settings;
create trigger trg_updated_at
before update on public.automation_settings
for each row execute function public.set_updated_at();

create or replace function public.claim_automation_job(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if p_worker_id is null or length(trim(p_worker_id)) < 3 then
    raise exception 'invalid_worker_id';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid_lease_seconds';
  end if;

  select j.id into v_job_id
  from public.automation_jobs j
  left join public.automation_settings s on s.org_id = j.org_id
  where j.status = 'queued'
    and j.scheduled_at <= now()
    and coalesce(s.enabled, true)
    and (
      select count(*)::integer
      from public.automation_jobs active
      where active.org_id = j.org_id
        and active.status = 'running'
    ) < coalesce(s.max_concurrent_jobs, 1)
  order by
    (
      case j.priority
        when 'critical' then 0
        when 'high' then 10
        when 'normal' then 20
        else 30
      end
      - least(20, floor(extract(epoch from (now() - j.created_at)) / 21600)::int)
    ),
    j.scheduled_at,
    j.created_at
  for update of j skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.automation_jobs
  set status = 'running',
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      leased_until = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      started_at = coalesce(started_at, now()),
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_automation_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_automation_job(text, integer) to service_role;
