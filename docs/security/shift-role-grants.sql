-- REVIEW ONLY. Adapt database/role placeholders and inspect effective rights.
-- Requires the approved additive Shift schema and a restricted runtime role.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'REPLACE_WITH_REVIEWED_DATABASE' THEN
    RAISE EXCEPTION 'Review the target database before applying shift grants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'REPLACE_WITH_REVIEWED_RUNTIME_ROLE'
    AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Review a nonprivileged runtime principal first';
  END IF;
END $$;
REVOKE ALL ON TABLE public."Shift", public."ShiftDepartment" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public."Shift" TO "REPLACE_WITH_REVIEWED_RUNTIME_ROLE";
-- Replacing allowed departments needs DELETE on the join table, not Shift.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."ShiftDepartment" TO "REPLACE_WITH_REVIEWED_RUNTIME_ROLE";
-- No ownership, migration membership, CREATE, TRUNCATE or AuditLog mutation
-- rights are granted. Existing AttendanceRecord and audit INSERT rights remain.
COMMIT;
-- Capture old ACLs before applying; reverse these new grants with explicit
-- REVOKE, restoring only captured PUBLIC ACLs if separately approved. Removing
-- these grants while an enabled deployment uses them will cause an outage.
