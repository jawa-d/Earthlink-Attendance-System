# Neon role change plan — REQUIRES MANUAL REVIEW

No SQL in this directory was executed. These are reviewed source-level proposals, not database-verified migrations. They intentionally fail with placeholders unchanged and are outside Prisma's migrations directory.

## Preflight and isolation

1. Identify the exact project, branch, database, current runtime principal and schema owners privately. Confirm that the existing local connection is the production runtime principal; Vercel secret values were not decrypted during this audit.
2. Use a schema-only isolated database with synthetic fixtures. Never clone employee data into an uncontrolled preview. Obtain owner/operator approval and capture a restorable backup before a production change.
3. Capture `pg_roles`, memberships, database/schema/table/type/sequence/routine owners, `pg_default_acl`, `relacl`, `nspacl`, database ACLs and every SECURITY DEFINER routine's body/ACL. Review RLS policies, triggers and extension privileges. Save these privately; do not include connection strings or passwords in a report.
4. Confirm no other application depends on the schema's PUBLIC CREATE or AuditLog ACLs. PostgreSQL PUBLIC grants are inherited even by NOINHERIT roles; ownership, role membership and callable privileged functions can bypass a table-only REVOKE. Resolve all such paths before declaring audit protection effective.
5. Adapt both SQL templates to captured owners, current tables/types and provider-supported role provisioning. Do not grant migration/owner membership to runtime. Test creating ordinary roles using the provider's supported mechanism; never grant `neon_superuser` to runtime. Provision passwords out of band through the approved secret manager.

## Required isolated assertions

Run as `earthlink_app`, with synthetic data only: session creation/logout; atomic rate-limit upsert; employee create/edit/soft delete; team-leader reassign and assignment history; QR cooldown transaction and `SELECT ... FOR UPDATE`; ordinary/manual attendance; filters and Excel/PDF imports/exports; snapshot export, password reauthentication and one-time permanent deletion; each associated audit INSERT in the same transaction. Preserve the authorized physical DELETE on AttendanceRecord because this feature already exists.

Under a SAVEPOINT in a disposable database, verify runtime **cannot** CREATE/DROP/ALTER tables, schemas or roles, use SET ROLE to a migration/owner principal, change AuditLog with UPDATE/DELETE/TRUNCATE, or write `_prisma_migrations`. Roll back all probes. Verify server catalog grants and effective memberships, not only Prisma errors. Exercise a representative migration through DIRECT_URL as `earthlink_migrator`, then rerun runtime flows. Confirm runtime has no new-table rights until explicit grants are approved.

## Production cutover — explicit approval required

Prepare the reviewed inverse ACL/owner SQL first. Complete isolated checks, backup restoration, inventory of consumers and secrets separation. Obtain approval for role changes, credential provisioning/rotation and deployment independently. Configure pooled DATABASE_URL for runtime; keep the direct migration credential in an operator-only environment, not Vercel's normal application runtime. Replace production secrets only through the protected platform workflow. Drain old instances and sessions/connections as planned; app session tokens are independent of database credentials and need not all be invalidated for a DB role change.

Canary the intended application build, check permissions/audit INSERT failures, then finish cutover. Once every consumer is verified, obtain approval to disable/rotate the former runtime credential. Restrict database/network/console access separately; SQL grants do not secure provider accounts or eliminate SQL-injection impact on tables runtime can still change.

## Rollback

If isolated tests fail, ROLLBACK the transaction and fix the draft. If cutover fails, stop release, return the application to the previously reviewed usable connection through a protected secret change, and apply the exact captured owner/ACL inverse only with approval. This temporarily restores the known high privilege risk: document duration and monitor it. Do not drop the new principal until no deployment uses it. Restore business data only if a separately approved recovery operation is required; a permissions rollback does not require deleting or rewriting AuditLog. The rollback SQL is intentionally a template because the full historical ACLs were not collected in this read-only audit.

PostgreSQL ownership and role membership need explicit review; see the [GRANT documentation](https://www.postgresql.org/docs/current/sql-grant.html). Restrict runtime privileges according to [OWASP database guidance](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html).
