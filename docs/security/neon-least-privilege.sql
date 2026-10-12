-- REVIEW TEMPLATE ONLY. DO NOT run through prisma migrate deploy.
-- Requires an operator-approved database, owner, backup and isolated rehearsal.
-- No passwords, credential rotation, record changes or audit rewrites here.
-- Replace the database placeholder after reviewing metadata. Leave this guard
-- in place; it intentionally rejects an unreviewed execution.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'REPLACE_WITH_REVIEWED_DATABASE' THEN
    RAISE EXCEPTION 'Select and review the target database before executing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('earthlink_app', 'earthlink_migrator')) THEN
    RAISE EXCEPTION 'Proposed roles already exist; inspect grants and adapt explicitly';
  END IF;
END $$;

-- Provision authentication for these principals separately via a protected
-- provider/operator workflow, after approval; do not embed a password here.
CREATE ROLE earthlink_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT;
CREATE ROLE earthlink_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT;

-- Review existing PUBLIC and inherited grants before this step. Other apps in
-- this schema may depend on PUBLIC CREATE: use a dedicated database if shared.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO earthlink_migrator;
GRANT USAGE ON SCHEMA public TO earthlink_app;
-- CONNECT is often granted to PUBLIC; don't revoke all PUBLIC connectivity on
-- a shared database. Explicitly grant CONNECT to both new roles here.
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO earthlink_migrator, earthlink_app', current_database());
END $$;

-- Explicit object ownership changes; never blanket REASSIGN OWNED on a shared
-- Neon branch. The executing operator must be authorized to transfer owners.
ALTER TABLE public."AdminUser" OWNER TO earthlink_migrator;
ALTER TABLE public."Session" OWNER TO earthlink_migrator;
ALTER TABLE public."Department" OWNER TO earthlink_migrator;
ALTER TABLE public."Employee" OWNER TO earthlink_migrator;
ALTER TABLE public."TeamLeader" OWNER TO earthlink_migrator;
ALTER TABLE public."EmployeeAssignment" OWNER TO earthlink_migrator;
ALTER TABLE public."AttendanceRecord" OWNER TO earthlink_migrator;
ALTER TABLE public."AuditLog" OWNER TO earthlink_migrator;
ALTER TABLE public."SystemSetting" OWNER TO earthlink_migrator;
ALTER TABLE public."AttendanceDeletionSnapshot" OWNER TO earthlink_migrator;
ALTER TABLE public."RateLimit" OWNER TO earthlink_migrator;
ALTER TABLE public."_prisma_migrations" OWNER TO earthlink_migrator;
ALTER TYPE public."Role" OWNER TO earthlink_migrator;
ALTER TYPE public."EmploymentStatus" OWNER TO earthlink_migrator;
ALTER TYPE public."AttendanceStatus" OWNER TO earthlink_migrator;
ALTER TYPE public."RegistrationMethod" OWNER TO earthlink_migrator;

-- Audit protection must also survive PUBLIC grants. Capture and review those
-- ACLs before revocation. An owner can still alter/delete audit data.
REVOKE ALL ON TABLE public."AdminUser", public."Session", public."Department",
  public."Employee", public."TeamLeader", public."EmployeeAssignment",
  public."AttendanceRecord", public."AuditLog", public."SystemSetting",
  public."AttendanceDeletionSnapshot", public."RateLimit",
  public."_prisma_migrations" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public."AuditLog" TO earthlink_app;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public."AdminUser", public."Department", public."Employee",
  public."TeamLeader", public."EmployeeAssignment", public."SystemSetting",
  public."AttendanceDeletionSnapshot" TO earthlink_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."Session", public."RateLimit", public."AttendanceRecord" TO earthlink_app;

-- Application IDs are generated UUIDs, not database sequences. No blanket
-- sequence, routine, TRUNCATE, REFERENCES, TRIGGER or schema DDL grants.
-- No access to _prisma_migrations for runtime. Review function EXECUTE grants
-- and SECURITY DEFINER routines separately; PUBLIC EXECUTE can grant access.
-- New tables are denied until their operations have been explicitly reviewed.
COMMIT;

-- Do not put migration credentials in the deployed application. Prisma's
-- DIRECT_URL is needed only by an approved operator migration job; build runs
-- prisma generate, not migrations. DATABASE_URL uses earthlink_app + pooling.
-- After cutover, inventory every consumer before disabling the old runtime
-- credential. Disabling/rotation requires explicit approval and a rollback plan.
