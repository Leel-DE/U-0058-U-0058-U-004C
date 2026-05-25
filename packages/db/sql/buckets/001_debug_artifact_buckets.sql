-- Debug artifact buckets are raw-SQL managed because Supabase storage is
-- outside Drizzle schema ownership. This is safe to run repeatedly.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    raise notice 'storage schema not present; skipping debug artifact buckets';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values
    ('screenshots', 'screenshots', false),
    ('html', 'html', false),
    ('debug', 'debug', false)
  on conflict (id) do nothing;

  execute 'drop policy if exists "debug artifacts service role only" on storage.objects';
  execute $sql$
    create policy "debug artifacts service role only"
    on storage.objects for all to service_role
    using (bucket_id in ('screenshots', 'html', 'debug'))
    with check (bucket_id in ('screenshots', 'html', 'debug'))
  $sql$;
end $$;
