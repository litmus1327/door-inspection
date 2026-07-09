-- Projects and inspectors — the team lists shown on the Projects page.
-- Run this once in the Supabase SQL editor (same as the other db/*.sql files).
--
-- NOTE: RLS is intentionally left OFF here to match the current internal setup
-- (the anon key already has table access). Tighten with row-level security when
-- you add per-user auth before rolling out to multiple clients.

create table if not exists public.projects (
  name        text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists public.inspectors (
  name        text primary key,
  created_at  timestamptz not null default now()
);

-- Let the anon key read/insert (internal tool; no RLS yet).
grant select, insert on public.projects   to anon;
grant select, insert on public.inspectors to anon;

-- Optional: seed your inspectors here so the picker is populated on first run.
-- insert into public.inspectors (name) values
--   ('Derek Example'),
--   ('Jane Inspector')
-- on conflict (name) do nothing;
