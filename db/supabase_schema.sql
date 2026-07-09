-- Codify Door Inspection — Supabase schema (milestone 1: durable sync)
-- Run this once in your Supabase project's SQL editor.
--
-- Design: the full inspection record is stored in `data` (jsonb) so the
-- app's evolving shape never breaks the schema. A few columns are
-- denormalized for querying and for the Reporting Tool to read.

create table if not exists public.door_inspections (
  id              text primary key,        -- app record id (stable per inspection)
  project         text,
  asset_id        text,
  icon_no         text,
  floor           text,
  status          text,                    -- pass | fail | conditional
  inspector       text,
  inspection_date timestamptz,
  data            jsonb not null,          -- full app record
  updated_at      timestamptz not null default now()
);

create index if not exists door_inspections_project_idx
  on public.door_inspections (project);
create index if not exists door_inspections_date_idx
  on public.door_inspections (inspection_date desc);

-- Row Level Security.
alter table public.door_inspections enable row level security;

-- Internal 4-person tool: the anon key (embedded in the app) is allowed
-- full access. This means anyone holding the URL + anon key can read/write
-- this table, so keep them private. Tighten with real auth later if needed.
drop policy if exists "anon_read"   on public.door_inspections;
drop policy if exists "anon_insert" on public.door_inspections;
drop policy if exists "anon_update" on public.door_inspections;
create policy "anon_read"   on public.door_inspections for select using (true);
create policy "anon_insert" on public.door_inspections for insert with check (true);
create policy "anon_update" on public.door_inspections for update using (true) with check (true);
