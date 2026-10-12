# Shift module — migration and deployment checklist

Prepared 2026-10-12, Asia/Baghdad. **Not deployed; no production SQL/data changes made.** Approvals for migration, release, gate activation and privileges are separate. Existing unresolved High security findings still prevent security approval.

## Isolated local/staging rehearsal

- [ ] Review the current combined working-tree diff, including the preceding security fixes. Read installed Next docs; use the generated Prisma 6.19 client and current lockfile.
- [ ] Provision a disposable PostgreSQL database/Neon schema-only branch with synthetic fixtures. Verify endpoint/database identities and never copy real employee data into an uncontrolled preview. This workspace's saved DATABASE_URL points to an existing Neon database; it is not automatically safe for development.
- [ ] In a dedicated terminal/process, configure DATABASE_URL and DIRECT_URL for that isolated target only, synthetic AUTH_SECRET, exact local APP_URL, stable HTTPS QR_BASE_URL if testing QR, and ATTENDANCE_SHIFTS_ENABLED=false. Avoid overwriting the current .env or .env.local.
- [ ] Review all pending migrations before executing `npm.cmd run db:migrate` on the **isolated** target. Apply the checked-in additive Shift migration; confirm zero attendance updates/deletes and NULL legacy shift fields. Generate/validate Prisma locally. No db push/reset or automatic production build migrations.
- [ ] Test fixture legacy attendance, all module flows, role/Origin/rate/size denials, shift edit/register contention, duplicate code races, snapshot constraints, existing permissions and audit transaction rollback.
- [ ] Run typecheck, lint, all tests/build; execute database suites only on the explicit isolated target. For shifts set SHIFT_TEST_DATABASE_URL plus SHIFT_TEST_DATABASE_ACK=isolated-synthetic-only, then run `npm.cmd test -- tests/shift-postgres.integration.test.ts`. Its guard checks configured application connection identities; the operator must still verify isolation and DNS aliases. The suite cleans only synthetic fixture IDs and should use a fixture-owner connection, not production runtime credentials.
- [ ] Set ATTENDANCE_SHIFTS_ENABLED=true only on synthetic staging; test missing/invalid/disallowed/disabled shifts, older clients omitting a UUID, spoofed code/time, every department's options and the global ten-hour cooldown. Gate-on unit/UI tests already run with mocks; real PostgreSQL and real-browser contention/mobile/print checks remain required.

## Proposed SQL review

Draft: [202610120001_shifts](../prisma/migrations/202610120001_shifts/migration.sql). It creates Shift/ShiftDepartment, adds nullable attendance FK/snapshot/schedule fields, indexes and consistency constraints. It contains no UPDATE/DELETE/TRUNCATE/DROP/backfill and preserves existing attendance/assignment/schema relationships. No production seed rows are inserted; admins create the organization's approved catalog later through audited UI.

The transaction sets lock_timeout5s and statement_timeout30s. Plan a maintenance/canary window based on table size; a normal CREATE INDEX may block writers while running. For a large table, review splitting column/constraint deployment from concurrent index creation before approval; do not edit applied migration history. Inspect locks/timeouts/failed migrations before retrying. Constraints/timeouts do not imply zero downtime.

The snapshot constraint is initially NOT VALID to avoid validating old rows inside the schema transaction. It still enforces complete-or-null snapshots on new/updated records. A separately approved follow-up is:

```sql
ALTER TABLE "AttendanceRecord"
  VALIDATE CONSTRAINT "AttendanceRecord_shift_snapshot_check";
```

Validate in a reviewed window after migration, confirming legacy NULL fields and complete selected snapshots with safe aggregates/fixture checks. Review [restricted shift grants](security/shift-role-grants.sql), actual owner/ACL/default privileges and metadata. Runtime needs Shift SELECT/INSERT/UPDATE for admin edits and FOR SHARE validation; ShiftDepartment replacement additionally needs DELETE. Keep AuditLog INSERT-only mutation rights and existing authorized AttendanceRecord physical-delete capability; do not grant migration/owner privileges to runtime. Permission drafts remain unexecuted.

## Production rollout — explicit approvals required

1. Obtain approval for the exact additive migration and privilege plan after isolated rehearsal, backup restoration and pending-migration inventory. Use only the reviewed direct operator/migrator principal. Save migration/ACL evidence privately; do not expose URLs/passwords. Do not run the SQL now just because the feature is coded.
2. Apply additive schema while the older application still runs. Its legacy inserts remain valid with NULL new columns. Confirm existing attendance count/history/cooldown is unchanged and backups are usable. Preserve expired/old deletion snapshots; approvals prepared before migration may fail fingerprint comparison once new NULL fields are returned, so reprepare/re-export rather than bypassing safeguards.
3. Separately approve release of the reviewed code with ATTENDANCE_SHIFTS_ENABLED=false. Rebuild with correct real target configuration; never deploy the synthetic local verification build. Confirm team/project/commit/environment and dependencies; no migration in the build command.
4. Through audited admin UI, create approved shifts, correct times and allowed departments; ensure every eligible department has at least one active option. Verify existing employee/leader/report/QR/deletion flows and legacy **بدون شفت** visibility.
5. Drain/retire/restrict old backend deployments and aliases that still accept shiftless creation. Scope previews to isolated data and exact preview origins. Monitor old/cached clients and communicate the selection requirement.
6. Obtain gate-activation approval, set server ATTENDANCE_SHIFTS_ENABLED=true and redeploy/restart as required by the approved platform process. Verify both public and new manual attendance require a permitted active UUID. Keep existing record corrections/restoration working without rewriting snapshots. Test bounded synthetic cases on an approved environment, not impersonation using real employees.
7. Monitor 400/413/429/503, option coverage, import/export/rendering costs, audit INSERT failures and lock waits. Confirm counters/UTC schedule dates, report filters, PDFs and mobile dropdown accessibility. Do not suppress errors by disabling auth/CSRF/quotas or granting owner roles.

## Safe rollback

- Before code rollout: failed SQL transaction rolls back its own additive DDL. If a migration times out, inspect actual transaction/migration state before retry; do not reset data or mark an unsuccessful migration successful blindly.
- After code or activation: with approval set ATTENDANCE_SHIFTS_ENABLED=false, communicate temporary legacy acceptance and retain all historical snapshots. This relaxes shift selection only; it does not resolve SEC-01 and must be documented. Revert to the reviewed previous application build if necessary. Keep additive tables/columns/indexes/data; older code can still use its known fields.
- Do **not** DROP new tables/columns, remove shift selections, backfill guessed definitions, reset cooldowns, recreate deleted records or alter audits as an automatic rollback. Do not remove grants while enabled code uses them. Reverse only newly granted permissions using captured ACLs after runtime rollback, with separate approval.
- Keep migration history and previously created shift data for forward repair. A later cleanup, if ever wanted, is a separate reviewed data migration with backups/explicit approval.

No production approval is requested by this document alone. It makes the implementation and exact proposed actions reviewable.
