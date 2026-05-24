-- Run AFTER the schema is up. Creates Supabase Storage buckets used by the app.
-- These statements only execute when the Supabase `storage` schema is present
-- (i.e. real Supabase, not bare Postgres used for tests).
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    raise notice 'storage schema not present; skipping bucket/policy setup';
    return;
  end if;

  -- Buckets
  insert into storage.buckets (id, name, public)
  values
    ('exports', 'exports', false),
    ('raw-html', 'raw-html', false),
    ('avatars', 'avatars', true)
  on conflict (id) do nothing;

  -- Storage RLS: members can read/write objects within their org folder
  -- (object key convention: {org_id}/{path}).
  execute 'drop policy if exists "exports read" on storage.objects';
  execute $sql$
    create policy "exports read"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'exports'
      and public.is_org_member((storage.foldername(name))[1]::uuid)
    )
  $sql$;

  execute 'drop policy if exists "exports insert" on storage.objects';
  execute $sql$
    create policy "exports insert"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'exports'
      and public.has_org_role(
        (storage.foldername(name))[1]::uuid,
        array['owner','manager']::org_role[]
      )
    )
  $sql$;

  execute 'drop policy if exists "raw-html service role only" on storage.objects';
  execute $sql$
    create policy "raw-html service role only"
    on storage.objects for all to service_role using (true) with check (true)
  $sql$;
end $$;
