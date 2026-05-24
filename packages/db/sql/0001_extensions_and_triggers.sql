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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
    'organizations','stores','my_products','scraping_rules'
  ]) loop
    execute format(
      'drop trigger if exists trg_updated_at on %I;
       create trigger trg_updated_at before update on %I
       for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- =====================================================================
-- Trigram indexes for matching suggestions
-- =====================================================================
create index if not exists my_products_name_trgm
  on my_products using gin (name gin_trgm_ops);
create index if not exists competitor_products_title_trgm
  on competitor_products using gin (title gin_trgm_ops);
