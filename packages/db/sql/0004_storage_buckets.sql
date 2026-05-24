-- Run AFTER the schema is up. Creates Supabase Storage buckets used by the app.
-- These statements use the storage.* helper functions and are idempotent.

insert into storage.buckets (id, name, public)
values
  ('exports', 'exports', false),
  ('raw-html', 'raw-html', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage RLS: members can read/write objects within their org folder
-- (object key convention: {org_id}/{path}).
create policy "exports read"
on storage.objects for select to authenticated
using (
  bucket_id = 'exports'
  and public.is_org_member((storage.foldername(name))[1]::uuid)
);

create policy "exports insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exports'
  and public.has_org_role(
    (storage.foldername(name))[1]::uuid,
    array['owner','manager']::org_role[]
  )
);

create policy "raw-html service role only"
on storage.objects for all to service_role using (true) with check (true);
