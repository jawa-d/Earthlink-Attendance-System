-- REVIEW TEMPLATE ONLY. Run with the owner/operator connection, after approval.
-- This rolls back only ownership/privileges from the companion proposal.
-- It does not change production records or passwords. The previous owner and
-- ACLs must be recorded before migration. Do not guess the previous owner.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'REPLACE_WITH_REVIEWED_DATABASE' THEN
    RAISE EXCEPTION 'Review target database before rollback';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'REPLACE_WITH_CAPTURED_PREVIOUS_OWNER') THEN
    RAISE EXCEPTION 'Restore the reviewed previous owner placeholder first';
  END IF;
END $$;
-- Restoring an owner role restores its inherent owner rights. It does not
-- recreate every captured ACL or reverse a previous credential rotation.
ALTER TABLE public."AdminUser" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."Session" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."Department" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."Employee" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."TeamLeader" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."EmployeeAssignment" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."AttendanceRecord" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."AuditLog" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."SystemSetting" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."AttendanceDeletionSnapshot" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."RateLimit" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TABLE public."_prisma_migrations" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TYPE public."Role" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TYPE public."EmploymentStatus" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TYPE public."AttendanceStatus" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";
ALTER TYPE public."RegistrationMethod" OWNER TO "REPLACE_WITH_CAPTURED_PREVIOUS_OWNER";

-- Insert the EXACT approved inverse ACL statements from the pre-change capture
-- here. Do not restore broad PUBLIC permissions just to make an error disappear.
-- Until that inverse is reviewed, rollback is deliberately incomplete.
-- Keep earthlink_app valid until all instances have switched. Removing login,
-- revoking grants or dropping roles while in use can create an outage.
COMMIT;
