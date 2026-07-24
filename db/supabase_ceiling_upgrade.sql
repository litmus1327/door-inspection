-- Above & Below Ceiling upgrade — lets one set of tables hold both door and
-- ceiling records, cleanly separated by an inspection-type discriminator.
-- Run this ONCE in the Supabase SQL editor (same as the other db/*.sql files).
-- Safe to re-run: every statement is idempotent.
--
-- Why reuse door_inspections / door_pins instead of new tables: both already
-- store the full record in a `data` jsonb column and are scoped by project name,
-- so ceiling records ride the existing sync path (client/src/lib/sync.ts) with no
-- code changes. The discriminator keeps the two service lines queryable apart.
-- (The `door_*` table names are now a cosmetic wart; a rename to inspections/pins
--  is a separate, non-blocking cleanup.)

-- Discriminator column. Existing rows default to the original door service line,
-- so no backfill is needed. The client sets it to 'above_below_ceiling' for
-- ceiling records; the in-`data` inspectionType field is the redundant source of
-- truth the exporter actually filters on.
alter table public.door_inspections
  add column if not exists inspection_type text not null default 'fire_smoke_doors';
alter table public.door_pins
  add column if not exists inspection_type text not null default 'fire_smoke_doors';

create index if not exists door_inspections_type_idx
  on public.door_inspections (inspection_type);
