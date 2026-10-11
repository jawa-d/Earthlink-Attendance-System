# Call Center update

Prepared target: Arabic name `مركز الاتصال`, English name `Call Center`, code `CALL_CENTER`, active.

The existing Department table receives nullable `englishName` and unique nullable `code` columns. Existing department IDs, names, employee links and status remain intact. No new tables or attendance rules are introduced.

Employee dropdowns, department filters, attendance views and reports already query departments dynamically and display the Arabic `name`. QR attendance checks the active employee and existing daily rules, regardless of department. No new QR or employee authentication is needed.

SUPER_ADMIN can create and edit department metadata and toggle status in `/admin/settings`. Existing API authorization and transactional audit logging remain in force.

## Approval-gated production steps

Do not push or execute the following production mutations before explicit user approval. A GitHub push may trigger Vercel deployment.

1. Review `prisma/migrations/202610110003_department_metadata/migration.sql` (two nullable columns and one unique index; no data modification).
2. From the trusted local environment, run `npm.cmd run db:migrate` to apply the additive migration before releasing application code that selects the new fields.
3. Run `npm.cmd run department:call-center` for a read-only preview.
4. Run `npm.cmd run department:call-center -- --apply` to configure the department and append an operator audit entry atomically. Existing Arabic/English/code matches are reused with their IDs intact. Conflicts stop the operation; no automatic merges or deletions. An already configured record produces no writes. An advisory lock serializes concurrent executions of this command, and unique indexes prevent duplicates.
5. After approved GitHub/Vercel release, sign in as SUPER_ADMIN and verify the Arabic department in Settings, employee add/edit, attendance filters and reports. Test QR registration only with an authorized employee; do not insert fictional employees into production.

The command suppresses raw database exception messages and never prints credentials. Default execution performs only SELECT queries. The migration and production record have not been applied by preparation alone.

## Preparation validation

Read-only production preview: no matching department exists, so the approved operation would create one record. Automated tests: 43 passed, one integration test skipped because no isolated test database is configured. TypeScript, ESLint and the full `npm run build` (including Prisma generation) passed. Production migration, real employee assignment and QR registration remain pending approval; no production fixtures were inserted.
