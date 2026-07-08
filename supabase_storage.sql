-- Floor-plan storage bucket (run once in the Supabase SQL editor).
-- Stores the plan PDF so a second device can pull it automatically.

-- Create a public bucket (public read; writes still gated by the policies below).
insert into storage.buckets (id, name, public)
values ('floor_plans', 'floor_plans', true)
on conflict (id) do update set public = true;

-- Allow the anon key to read/write objects in this bucket only.
-- Note: a public bucket means anyone with the file URL can read the PDF.
-- Keep the project URL/key private. Tighten with auth later if needed.
drop policy if exists "floor_plans_read"   on storage.objects;
drop policy if exists "floor_plans_insert" on storage.objects;
drop policy if exists "floor_plans_update" on storage.objects;
create policy "floor_plans_read"
  on storage.objects for select using (bucket_id = 'floor_plans');
create policy "floor_plans_insert"
  on storage.objects for insert with check (bucket_id = 'floor_plans');
create policy "floor_plans_update"
  on storage.objects for update using (bucket_id = 'floor_plans') with check (bucket_id = 'floor_plans');
