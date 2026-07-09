-- Inspection photos storage bucket (run once in the Supabase SQL editor).
-- Stores photos attached to doors during inspection.

insert into storage.buckets (id, name, public)
values ('door_inspection_photos', 'door_inspection_photos', true)
on conflict (id) do update set public = true;

drop policy if exists "photos_read"   on storage.objects;
drop policy if exists "photos_insert" on storage.objects;
create policy "photos_read"
  on storage.objects for select using (bucket_id = 'door_inspection_photos');
create policy "photos_insert"
  on storage.objects for insert with check (bucket_id = 'door_inspection_photos');
