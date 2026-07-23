-- Projects upgrade — adds a service-line category and an archive flag to
-- projects, and grants the permissions needed to edit/archive/delete them.
-- Run this ONCE in the Supabase SQL editor (same as the other db/*.sql files).
-- Safe to re-run: every statement is idempotent.

-- 1. New columns on the projects table.
alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists archived boolean not null default false;

-- 2. Permissions. The table previously granted only select + insert to the
--    anon key. Archiving needs UPDATE; permanent delete needs DELETE (on the
--    project row and on its inspection records — door_pins already allows
--    delete for the existing pin-delete feature).
grant update, delete on public.projects          to anon;
grant delete          on public.door_inspections  to anon;
