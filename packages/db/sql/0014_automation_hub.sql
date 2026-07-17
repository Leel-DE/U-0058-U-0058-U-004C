-- Durable, typed queue for every browser automation workload.
-- Drizzle owns table shape. This file owns invariants, atomic leasing and RLS boundaries.

alter table public.automation_jobs
  add constraint automation_jobs_attempts_check check (attempt_count >= 0 and max_attempts between 1 and 10),
  add constraint automation_jobs_payload_object_check check (jsonb_typeof(payload_json) = 'object'),
  add constraint automation_jobs_progress_check check (
    progress_json is null or jsonb_typeof(progress_json) = 'object'
  );

create unique index if not exists automation_jobs_active_dedupe_unique
  on public.automation_jobs (org_id, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running', 'awaiting_user');

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

  select id into v_job_id
  from public.automation_jobs
  where status = 'queued'
    and scheduled_at <= now()
  order by
    (
      case priority
        when 'critical' then 0
        when 'high' then 10
        when 'normal' then 20
        else 30
      end
      - least(20, floor(extract(epoch from (now() - created_at)) / 21600)::int)
    ),
    scheduled_at,
    created_at
  for update skip locked
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

create or replace function public.heartbeat_automation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 120,
  p_progress jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid_lease_seconds';
  end if;
  update public.automation_jobs
  set heartbeat_at = now(),
      leased_until = now() + make_interval(secs => p_lease_seconds),
      progress_json = coalesce(p_progress, progress_json),
      updated_at = now()
  where id = p_job_id
    and lease_token = p_lease_token
    and status = 'running';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.recover_stale_automation_jobs()
returns table(requeued integer, dead_lettered integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requeued integer := 0;
  v_dead integer := 0;
begin
  with recovered as (
    update public.automation_jobs
    set status = 'queued',
        scheduled_at = now() + make_interval(secs => least(300, 15 * greatest(attempt_count, 1))),
        lease_owner = null,
        lease_token = null,
        leased_until = null,
        heartbeat_at = null,
        error_code = 'stale_lease_recovered',
        error_summary = 'Worker heartbeat expired; job safely requeued.',
        updated_at = now()
    where status = 'running'
      and leased_until < now()
      and attempt_count < max_attempts
    returning 1
  ) select count(*) into v_requeued from recovered;

  with exhausted as (
    update public.automation_jobs
    set status = 'dead_letter',
        finished_at = now(),
        lease_owner = null,
        lease_token = null,
        leased_until = null,
        heartbeat_at = null,
        error_code = 'attempts_exhausted',
        error_summary = 'The job exhausted its retry budget after a stale worker lease.',
        updated_at = now()
    where status = 'running'
      and leased_until < now()
      and attempt_count >= max_attempts
    returning 1
  ) select count(*) into v_dead from exhausted;

  return query select v_requeued, v_dead;
end;
$$;

revoke all on function public.claim_automation_job(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_automation_job(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.recover_stale_automation_jobs() from public, anon, authenticated;
grant execute on function public.claim_automation_job(text, integer) to service_role;
grant execute on function public.heartbeat_automation_job(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.recover_stale_automation_jobs() to service_role;

alter table public.shipments enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_job_events enable row level security;
alter table public.shipment_events enable row level security;
alter table public.shipment_provider_results enable row level security;
alter table public.automation_artifacts enable row level security;
alter table public.provider_health enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.shipment_update_requests enable row level security;

create policy shipments_select on public.shipments for select
  using (public.is_org_member(org_id));
create policy shipments_insert on public.shipments for insert
  with check (public.has_org_role(org_id, array['owner','manager']::org_role[]));
create policy shipments_update on public.shipments for update
  using (public.has_org_role(org_id, array['owner','manager']::org_role[]))
  with check (public.has_org_role(org_id, array['owner','manager']::org_role[]));
create policy shipments_delete on public.shipments for delete
  using (public.has_org_role(org_id, array['owner']::org_role[]));

create policy automation_jobs_select on public.automation_jobs for select
  using (public.is_org_member(org_id));
create policy automation_job_events_select on public.automation_job_events for select
  using (public.is_org_member(org_id));
create policy shipment_events_select on public.shipment_events for select
  using (public.is_org_member(org_id));
create policy shipment_provider_results_select on public.shipment_provider_results for select
  using (public.is_org_member(org_id));
create policy provider_health_select on public.provider_health for select
  using (public.is_org_member(org_id));

-- Artifacts, provider telemetry mutations, queue lifecycle and notification receipts are worker-only.
create policy automation_artifacts_owner_select on public.automation_artifacts for select
  using (public.has_org_role(org_id, array['owner']::org_role[]));

create policy shipment_update_requests_select on public.shipment_update_requests for select
  using (public.is_org_member(org_id));
create policy shipment_update_requests_insert on public.shipment_update_requests for insert
  with check (public.is_org_member(org_id) and requested_by = auth.uid());

create or replace view public.shipment_tracking_public
with (security_invoker = true)
as
select
  id,
  org_id,
  tracking_number,
  display_name,
  current_status,
  previous_status,
  status_title,
  status_description,
  last_location,
  last_carrier,
  confidence,
  last_checked_at,
  last_event_at,
  next_check_at,
  delivered_at,
  updated_at
from public.shipments;

grant select on public.shipment_tracking_public to authenticated;
