-- Run AFTER `drizzle-kit push` to enable extensions, profile auto-creation,
-- updated_at triggers, RLS, and helper views.
-- Idempotent: safe to re-run.

-- =====================================================================
-- Extensions
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "citext";

-- =====================================================================
-- Supabase role shims for bare Postgres (tests/CI)
-- =====================================================================
-- Supabase creates these roles itself. A plain Postgres service does not,
-- but later grants and RLS policies still need the role names to exist.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
  end loop;
end $$;

-- =====================================================================
-- Shim: provide a stub auth.uid() so RLS policies referencing it compile
-- on bare Postgres (used by tests/CI). On real Supabase the auth schema
-- and its functions already exist; we MUST NOT overwrite them.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'create schema auth';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute 'create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$';
  end if;
end $$;

-- =====================================================================
-- Auto-create profile row when a new auth.users row appears
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only attach the trigger when running against Supabase (auth.users exists).
-- On a bare Postgres used for local tests there is no auth schema, so we skip.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'auth' and table_name = 'users') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created
             after insert on auth.users
             for each row execute function public.handle_new_user()';
  end if;
end $$;

-- =====================================================================
-- Updated-at triggers
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','stores','my_products','scraping_rules','selector_repair_attempts'
  ]) loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'drop trigger if exists trg_updated_at on %I;
         create trigger trg_updated_at before update on %I
         for each row execute function public.set_updated_at();',
        t, t
      );
    end if;
  end loop;
end $$;

-- =====================================================================
-- Trigram indexes for matching suggestions
-- =====================================================================
create index if not exists my_products_name_trgm
  on my_products using gin (name gin_trgm_ops);
create index if not exists competitor_products_title_trgm
  on competitor_products using gin (title gin_trgm_ops);
