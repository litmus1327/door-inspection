-- One-time reset: replace any existing door_inspections table with the
-- correct schema. Safe to run now because no inspection data has synced yet.
-- (If you ever have real synced data, do NOT run this — it deletes the table.)

drop table if exists public.door_inspections cascade;

create table public.door_inspections (
  id              text primary key,
  project         text,
  asset_id        text,
  icon_no         text,
  floor           text,
  status          text,
  inspector       text,
  inspection_date timestamptz,
  data            jsonb not null,
  updated_at      timestamptz not null default now()
);

create index door_inspections_project_idx on public.door_inspections (project);
create index door_inspections_date_idx    on public.door_inspections (inspection_date desc);

alter table public.door_inspections enable row level security;

create policy "anon_read"   on public.door_inspections for select using (true);
create policy "anon_insert" on public.door_inspections for insert with check (true);
create policy "anon_update" on public.door_inspections for update using (true) with check (true);
