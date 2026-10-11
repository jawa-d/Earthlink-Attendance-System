# Permanent attendance deletion with mandatory Excel backup

The existing soft-delete/restore routes remain unchanged. A separate
`/api/admin/attendance-deletion` endpoint requires SUPER_ADMIN, a valid current
session and same-origin requests for every operation. The UI supports one record
or all actual attendance events matching the active filters, across all pages.
Synthetic UNREGISTERED entries cannot be permanently deleted.

1. `prepare` captures the exact IDs, all AttendanceRecord fields, employee details,
   and historical department/leader attribution into a server-side snapshot.
   The count is computed from that snapshot, not the currently loaded table.
   It is bound to the admin and hashed session ID and expires after 15 minutes.
   Up to 5000 records are allowed; larger selections must be narrowed explicitly.
2. `export` creates an Excel file from those saved records, including attendance
   and employee IDs, historical leader/department IDs, timestamps in Baghdad and
   UTC, status and original check-in time. Generation must succeed before an
   export timestamp and file hash are stored. A session-bound HMAC receipt is
   returned with the file; re-export invalidates prior reauthentication/code approval.
3. The browser reads the full file response, starts the download and only then
   displays the mandatory, initially unchecked backup confirmation. A browser
   cannot prove that the user saved a file to disk; the checkbox is the user's
   explicit attestation, backed by successful file generation and receipt.
4. Password reauthentication uses the current SUPER_ADMIN account's existing
   Argon2 password hash, is rate limited, and remains valid for five minutes for
   this snapshot only. Passwords never enter snapshots or audit logs.
5. A server-generated, snapshot-specific confirmation code is displayed for
   deliberate re-entry. This is a deletion confirmation, not an OTP or additional
   authentication factor. Only its HMAC is stored. Verification is performed and
   recorded on the server; the final request also checks the code again.
6. The final explicit DELETE request requires literal `backupConfirmed: true`,
   the backup receipt, reason, recent reauthentication and prior successful code
   verification. It accepts no new filters or IDs from the browser.
7. A serializable transaction locks the snapshot and selected attendance rows,
   acquires the existing assignment-write lock, reruns the saved selection and
   compares the complete fingerprint. Added matching events, missing records,
   corrections, or changes to exported employee/assignment details reject the
   operation with 409. The user must prepare and export a fresh snapshot.
8. Per-record audits preserve the original record and backup linkage. Deletion,
   batch audit and snapshot consumption commit atomically; errors roll back the
   transaction. Snapshots are single-use. Audit logs and the durable employee
   cooldown timestamp are retained.

## Schema and release

The additive migration `202610110006_attendance_deletion_snapshot` creates the
durable snapshot table and its admin relation. No attendance data is modified by
the migration. It has been prepared locally, not applied to production. Before
deploying this feature, validate the migration on an isolated Neon branch and
apply it using the existing Prisma migration workflow and a direct connection.
Expired snapshots are inert; no automatic attendance deletion or cleanup job is
introduced. Snapshot/audit evidence contains employee data and remains protected
by admin access. Any future retention/cleanup policy should be explicit.

## Validation safety

New server and UI tests use a mocked Prisma client and synthetic records only.
Run `npm test -- --exclude tests/integration.test.ts` for checks that never connect
to a database. Real concurrency/migration validation still requires an isolated,
already migrated TEST_DATABASE_URL; never use production Neon for destructive tests.
