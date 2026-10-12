# Shift Management — implementation and rollout

Date: 2026-10-12, Asia/Baghdad. Implementation is local; no push, deployment, production migration, credential change or production record modification was performed.

## Module and permissions

`/admin/shifts` and sidebar **الشفتات** provide responsive RTL search, status/department filtering, pagination, creation and editing/activation/deactivation with audit reasons. ADMIN/SUPER_ADMIN may write; VIEWER may read only. The API independently authorizes every operation. Codes normalize to uppercase, allow letters/digits/underscore/hyphen up to 20 characters, and are database-unique. Names are 2..120 characters. Times are validated HH:mm in 24-hour storage and displayed as 12-hour times with ص/م; equal times are rejected rather than guessing a 24-hour shift. End before start means overnight.

Empty restrictions mean all departments; explicit ShiftDepartment rows restrict selection to those departments. Department IDs must exist. Inactive departments remain configurable because this feature does not silently change the existing rule that an active Employee is eligible even if a department was later deactivated. No shift is physically deleted through HTTP. Deactivation keeps records and IDs available in filters; rename/code/time changes do not rewrite old attendance. An administrator remains organization-wide, as in existing RBAC; this module does not invent department-scoped administrator ownership.

Routes:

| Route | Permission/checks |
| --- | --- |
| GET `/api/admin/shifts` | read; q/active/department/page/limit; shared 90/user/min quota; max1000 rows/page, normal page25 |
| POST `/api/admin/shifts` | write + exact Origin + bounded object JSON + 40/user/min quota + Zod/reason; transaction/audit |
| PATCH `/api/admin/shifts/:id` | write + Origin/UUID/JSON/quota/reason; locked definition/restriction transaction/audit |
| DELETE `/api/admin/shifts/:id` | write + Origin, then409; use deactivation |
| GET `/api/attendance/shifts` | public rollout state only; private/no-store; no database lookup |
| POST `/api/attendance/shifts` | exact Origin, bounded corporate email, 30/email/10min +600/global/10min; active employee's server-derived department; active permitted catalog fields only |

All new routes use existing no-store/error handling. Public choices exclude employee name, email, employee/department IDs and admin/audit fields. Unknown, inactive, deleted or no-options employees receive a generic empty list. Choice discovery is limited to 1000 matches, failing closed with503 above that budget rather than silently hiding valid choices. Administrative choices fetch every paginated catalog page; a quota failure is shown as an error, not silently treated as a complete catalog. A caller knowing an employee email can still learn their permitted shift set; this is an additional information-discovery boundary of the requested email-based flow, not an identity proof.

## Schema and historical contract

- `Shift`: UUID, unique code, name, startTime/endTime, isActive, timestamps.
- `ShiftDepartment`: explicit composite-key join with restrictive foreign keys. No restriction column was added to Employee/EmployeeAssignment. Existing historical leader/department assignment intervals keep their meaning.
- AttendanceRecord: optional `shiftId` FK plus independent `shiftCodeSnapshot`, `shiftNameSnapshot`, `shiftStartTimeSnapshot`, `shiftEndTimeSnapshot`, `shiftBusinessDate`, `shiftStartsAt`, `shiftEndsAt`.
- Legacy records remain valid with **all** shift columns NULL and render **بدون شفت**. There is no historical backfill, reassignment or attendance data update in the migration.
- A new selected shift is rechecked for existence, active state and allowed department under the employee registration transaction. FOR SHARE on Shift serializes the snapshot against administrative FOR UPDATE edits/restriction replacement. Client name/code/times/department/employee UUID never determine the snapshot.
- Code/name/time snapshots and scheduled instants stay immutable through ordinary attendance correction/restoration/employee movement. A supplied attempt to replace the shift on an existing record is rejected. Historical snapshots are not read from today's Shift name/time. Backup snapshots/fingerprints and permanent-deletion exports also include shift fields.

The SQL in `prisma/migrations/202610120001_shifts/migration.sql` is an **approval-dependent additive draft**. Prisma generation and validation were run locally; a schema-only Prisma diff from the baseline confirms only new tables, nullable attendance columns, indexes and foreign keys. The hand-reviewed draft additionally adds definition consistency CHECKs and a complete-or-null attendance snapshot CHECK. The latter is NOT VALID initially: existing rows are not scanned for validation in the schema transaction, while new/updated rows are checked. A separate approved VALIDATE step is in the deployment checklist. Lock/statement timeouts bound the attempt; index creation still requires planning for table size/traffic. No zero-downtime guarantee is claimed.

The runtime/migrator privilege split remains required. [Shift-specific grant draft](security/shift-role-grants.sql) grants only SELECT/INSERT/UPDATE on Shift and CRUD on its restriction join, preserving existing AttendanceRecord and append-only audit rights. It is guarded, not executed, and needs the actual reviewed principal/ACLs. Do not grant owner/CREATEDB/CREATEROLE/BYPASSRLS or runtime Shift DELETE to make the feature work.

## Public attendance and staged enforcement

The public email form now displays a shift selector after email. An abortable, debounced email lookup loads only permitted active choices; selection resets on email changes. Configuration/loading/error states block submission safely; unavailable options explain how to contact the department. The client submits only email and canonical shift UUID. The server ignores untrusted status, timestamps, codes and ownership fields. Successful receipts show the saved shift label.

`ATTENDANCE_SHIFTS_ENABLED=false` is the default compatibility stage. Shift setup/admin management/reporting may be used after schema migration, but legacy email-only public and manual creation remains accepted until an **approved** switch to `true`. Optional selections, when supplied, are still validated and snapshotted. With `true`, every new public registration and every new manually added attendance record must have a valid permitted active shift. Updating/restoring an old record without a shift remains allowed and never invents a historical assignment. Old/cached clients cannot bypass the new server's requirement by omitting the field. A rollout flag supplied in the request is ignored; only server environment configuration applies.

Apply additive schema first while old code is still running, then deploy reviewed code with the gate false, create/validate choices for every active employee department, retire/drain old servers/deployment aliases that still accept shiftless registrations, and only then enable the gate with separate approval. Nullable historical columns deliberately cannot prevent an old backend from inserting a legacy-format row, so draining/restricting older deployments is part of enforcement. Production and preview secrets/branches must remain separate.

## Overnight and business-date semantics

S02 16:30 →01:00 with a Baghdad check-in at 2026-10-13 00:30 stores:

| Field | Stored meaning/example |
| --- | --- |
| attendanceDate | Existing calendar-of-check-in rule: 2026-10-13 (UTC date representation) |
| shiftBusinessDate | Schedule start date: 2026-10-12 |
| shiftStartsAt | 2026-10-12T13:30:00Z =16:30 Baghdad |
| shiftEndsAt | 2026-10-12T22:00:00Z =01:00 Baghdad on Oct13 |

The window is one scheduled shift crossing midnight, not two definitions. IANA Asia/Baghdad offsets are used, including a historical DST test; server UTC instants are stored consistently. At or after an overnight end, a check-in outside that window anchors to the current day's upcoming schedule; before the end it anchors to the previous day. Outside-window selection is permitted because this feature adds **no** new attendance eligibility/late/absence rules. The exact end is treated as exclusive. Ambiguous legacy-era DST wall times are not a new scheduling policy and require review if such dates must be manually entered.

The existing `attendanceDate` and report date filters still use the registration calendar date. Schedule-start dates are displayed with shift details/exported separately; they do not silently change prior daily totals, employee-assignment intervals or manual timestamp validation. A manual record without a check-in time anchors its schedule start to the operator-selected attendance date, without fabricating a check-in. Original check-in/registeredAt and the durable lastSuccessfulAttendanceAt keep their existing meaning.

The rolling ten-hour cooldown runs under the existing Employee lock, across **all** shifts. Changing shift IDs, clearing the receipt, renaming a shift or soft-deleting a record cannot reset it. Same-day events after ten hours remain allowed. QR status is still PRESENT; no automatic lateness/absence inference was added.

## Reports, exports and statistics

Attendance/reports filters combine date, department, historical leader, employee, status and stable shift UUID; `shift=none` selects legacy records without a shift. Active and inactive definitions are available in administration filters. Historical code/name/time appears in tables, raw Excel/PDF, grouped leader exports and deletion backups. If a daily employee summary contains multiple events/shift occurrences, it shows all recorded snapshot labels/schedule dates and keeps the existing single employee-day count and first/latest/event count.

A selected shift filters **recorded events**, not an employee roster. There is no permanent employee-to-shift assignment in this feature. Grouped leader summaries with a shift filter therefore use matching recorded employee-days and do not invent expected absence/unregistered days or a shift attendance percentage based on department availability. This behavior is explained in the UI. With no shift filter, existing historical employment/absence report semantics remain unchanged. Raw UNREGISTERED + a specific shift returns no inferred records; raw `none` can display existing synthetic unregistered rows without assigning them a shift.

Dashboard includes groups by saved shift identity/definition snapshot, event count and distinct employees who have timed PRESENT/LATE events. A person can count once in several shift groups; group totals need not equal the dashboard's unique employee total. Existing daily/trend/month/department counts are untouched. There is no payroll-grade shift roster or proof of physical presence.

## Security status

**SEC-01 remains OPEN:** email + selection can still impersonate another employee. Shift choice, Origin, a static QR and allowed-department filtering do not authenticate the submitter. Employee SSO/OTP/purpose-bound one-time credentials are a separate approved migration, described in SECURITY_FIXES.md. Admin MFA/step-up and database privilege risks remain unresolved; implementing shifts is not a security approval. Existing auth/role/Origin/body/rate/audit controls and previous local audit fixes are preserved.

The earlier SECURITY_AUDIT_REPORT.md is the baseline audit; the shift module adds these routes, schema fields, disclosure boundary and tests. It was not deployed or included in the earlier bounded production observations. No new production checks were made during this implementation.

## Validation

Tests cover normalized/duplicate codes; validation and department restrictions; CRUD/audit; role/Origin/rate/body denial; allowed/invalid/no shift; forgery; immutable history; legacy data; overnight/month/year/Baghdad midnight/historical offset; unchanged cooldown; manual creation and snapshot correction rejection; date/department/leader/employee/status/shift predicates; raw/grouped Excel/PDF; dashboard grouping; Arabic forms, VIEWER controls, selector/error/reset and label rendering. The extended security matrix exercises the actual server authorization at all new admin handler boundaries.

`tests/shift-postgres.integration.test.ts` is opt-in and does no migration itself. It runs real Prisma/route transactions only with an explicitly acknowledged, separately migrated disposable database and synthetic fixture IDs. Neither that suite nor the existing PostgreSQL suite was executed because no isolated DB URL is configured. Mocked tests and generated PDF/XLSX artifacts are not a claim of real-database or visual-browser validation. Final command/results are recorded in [shift test results](SHIFT-TEST-RESULTS.md).

For an isolated local developer database, follow [deployment and migration checklist](SHIFTS-DEPLOYMENT.md) using a separate ignored environment file/terminal. Do not point `next dev`, seed or integration fixtures at the saved production database in this workspace.
