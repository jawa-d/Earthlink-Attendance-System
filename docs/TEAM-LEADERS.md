# Team leader management

This change requires the additive migration `202610110004_team_leaders`. It has **not** been applied to the production Neon database as part of implementation. No production records, credentials or permissions were changed.

## Administration

`/admin/team-leaders` (الليدرية) lists leaders, their departments, status and current assigned employee counts. SUPER_ADMIN and ADMIN use the existing server-side `write` permission to create, edit, deactivate and reassign. VIEWER has read-only access to leaders, employees and reports. Mutations require a same-origin request, Zod validation, an authenticated session and an audit reason.

Leaders belong to an active department. Employee forms show only active leaders from the selected department. Changing departments clears the selection. Inline creation refreshes and selects the new leader while retaining the employee form. An active employee must have a leader when any leaders have been configured for that department, including previously deactivated leaders. Existing unassigned employees remain valid and are not automatically modified; the requirement applies on creation or subsequent edits. Inactive employees can remain unassigned.

Deactivation preserves existing assignments. Use **إعادة التعيين** to transfer all non-deleted assigned employees to another active leader in the same active department, optionally deactivating the old leader in that transaction. Each employee reassignment and the batch operation are audited. A leader with assigned employees cannot change departments. Physical deletion is refused, including for currently unassigned leaders, to preserve history.

Employee Excel exports append `teamLeaderId` and `teamLeader` after the existing columns. Imports accept an optional `teamLeaderId` column; active employees in configured departments require a valid active same-department leader. The original five-column import format remains accepted in departments without configured leaders.

## Historical assignment strategy

`Employee.teamLeaderId` is the current management relationship. `EmployeeAssignment` records dated leader, department and employment-status snapshots, plus leader/department display names. Foreign keys use RESTRICT rather than cascading deletion. Indexes support dated filtering. A check constraint requires a positive interval, and a partial unique index permits only one open interval per employee.

Dates are Baghdad calendar dates stored as PostgreSQL DATE. Intervals are start-inclusive and end-exclusive. New employees receive an initial snapshot on their Baghdad creation date. Assignment, department, activation/deactivation and soft-deletion changes affect dated reports from the **next Baghdad calendar day**; the current employee record changes immediately. Repeated changes on the same day replace that day's pending next-day snapshot, leaving past snapshots unchanged. Assignment-changing transactions acquire a shared PostgreSQL advisory transaction lock before employee row locks to prevent competing admin changes from producing inconsistent history.

The migration creates one current-state baseline per existing employee from the migration's Baghdad date (or employee creation date if later). Existing `teamLeaderId` values start NULL. It does not invent earlier leader assignments or employment periods. Reports before the baseline retain actual attendance records, flag incomplete coverage and do not infer absence for unknown employment status. `createdAt` is used as the earliest known employment boundary because the existing schema has no separate hiring date. Accurate older employment periods cannot be reconstructed from current state alone.

## Reports and exports

The reports page uses `/api/admin/team-leader-reports` and supports leader (including unassigned), historical department, date range, attendance status and employee filters. The end date cannot be later than today in Baghdad. A range is limited to approximately one year.

Daily reports count employees active in that day's historical snapshot. For a range, totals use **employee-days**; a separate unique employee count is shown per leader. PRESENT/LATE with a check-in count as present; EXCUSED is separate; an eligible day with no attendance, an ABSENT record or no qualifying check-in counts as absent. Attendance percentage is present employee-days divided by all eligible employee-days. Unknown employment days are excluded from this denominator. The status filter affects detail rows; summary denominators remain unchanged to avoid inflated percentages. UNREGISTERED remains a separate detail status even though it contributes to summary absence.

Employees moved between leaders or departments remain attributed to their dated assignment. Soft-deleted and currently inactive employees retain their earlier report history. Leader names in detail rows use the saved snapshot; summary headings identify the leader by current name when available. Excel exports include separate summary, detail and coverage-note sheets. PDF exports use the existing Arabic font and include grouped summaries and details.

## Deployment procedure — approval required

1. Review the source changes and migration; take a Neon restore point/backup using the existing project workflow.
2. Obtain approval before applying production migrations. In the existing project with securely configured `DIRECT_URL`, run `npm run db:migrate` (Prisma migrate deploy). Never use reset or db push. Apply the additive migration before deploying this application version; the previous version can continue running with the added nullable column and tables.
3. Run `npm run db:check -- --require-schema` after the approved migration. The required schema now includes TeamLeader and EmployeeAssignment. Check the migration status as well.
4. Obtain approval before pushing or deploying. The existing Vercel build runs `prisma generate && next build`. No new environment variables or production permission changes are required by this feature.
5. Verify real ADMIN/SUPER_ADMIN leader creation, a controlled employee assignment, VIEWER read-only access, grouped date-based reports and exports after the approved migration/deployment. These checks require an approved isolated database/test account or separately approved production test records.

Local automated tests use synthetic fixtures and mocked database calls. They cover server validation, role gates, CRUD/deactivation/reassignment, employee API integration, Baghdad/history boundaries, UI filtering and inline creation, report calculations, and XLSX/PDF generation. These tests do not prove that the new migration has executed on Neon. The database integration suite remains skipped without an explicitly configured isolated test database; it must never be pointed at production for this verification.
