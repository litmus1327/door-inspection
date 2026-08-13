-- Inspection-record DELETE policy — the missing half of the delete permission.
-- Run this ONCE in the Supabase SQL editor. Safe to re-run.
--
-- THE BUG. `door_inspections` has row level security ENABLED (supabase_schema.sql)
-- with only three policies: anon_read, anon_insert, anon_update. There is no
-- DELETE policy. supabase_projects_upgrade.sql granted the DELETE *privilege*:
--
--     grant delete on public.door_inspections to anon;
--
-- but a privilege is not a policy. With RLS on and no permissive DELETE policy,
-- Postgres matches ZERO rows and PostgREST returns 204 No Content -- which is
-- indistinguishable from a successful delete.
--
-- So the app believed every delete worked. supabase.deleteInspectionRecord
-- returned true, doorRecords.deleteRecords reported success, the row survived in
-- the cloud, and the next syncInspections downloaded it again: the record the
-- inspector deleted came back. supabase.deleteProject's door_inspections cleanup
-- was a silent no-op for the same reason, so deleting a project left its
-- inspection records behind.
--
-- The tell is the asymmetry: door_pins HAS an explicit anon_delete policy (see
-- supabase_pins.sql), which is exactly why deleting a pin has always worked
-- while deleting a record never did.
--
-- These db/*.sql files are applied by hand with no migration record, so the live
-- database may not match what is written here. Section 3 below reports what is
-- actually in place -- read it rather than assuming.

-- 1. The policy. Mirrors anon_delete on door_pins.
drop policy if exists "anon_delete" on public.door_inspections;
create policy "anon_delete" on public.door_inspections for delete using (true);

-- 2. The privilege, repeated here so this file stands alone if the projects
--    upgrade was never applied.
grant delete on public.door_inspections to anon;

-- 3. Verification. Expect FOUR rows: anon_read, anon_insert, anon_update and
--    anon_delete. If anon_delete is missing after running this, deletes are
--    still silently doing nothing.
select
  policyname,
  cmd,
  case when cmd = 'DELETE' then '<-- the one that was missing' else '' end as note
from pg_policies
where schemaname = 'public'
  and tablename = 'door_inspections'
order by cmd, policyname;
