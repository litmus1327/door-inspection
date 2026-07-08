-- Door pins table (run once in the Supabase SQL editor, after the
-- door_inspections table). Stores placed pins so a second device sees the
-- same doors. Full pin kept in `data`; a few columns for querying.

create table if not exists public.door_pins (
  id           text primary key,
  project      text,
  page_number  int,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists door_pins_project_idx on public.door_pins (project);
create index if not exists door_pins_page_idx    on public.door_pins (page_number);

alter table public.door_pins enable row level security;

drop policy if exists "anon_read"   on public.door_pins;
drop policy if exists "anon_insert" on public.door_pins;
drop policy if exists "anon_update" on public.door_pins;
drop policy if exists "anon_delete" on public.door_pins;
create policy "anon_read"   on public.door_pins for select using (true);
create policy "anon_insert" on public.door_pins for insert with check (true);
create policy "anon_update" on public.door_pins for update using (true) with check (true);
create policy "anon_delete" on public.door_pins for delete using (true);
