# Department management

`/admin/departments` lists all departments with Arabic names, optional English names, codes, status and linked employee counts (including historical employee records). Search matches names and codes; status filters use the database. The sidebar includes الأقسام.

Existing roles remain unchanged: SUPER_ADMIN creates, edits and deactivates; ADMIN and VIEWER have read-only department access. APIs enforce the same permissions, require matching Origin on mutations, validate with Zod and append audit entries transactionally. Required codes normalize to uppercase; PostgreSQL enforces uniqueness. Legacy departments with null codes may be deactivated without rewriting their metadata, but new departments require a code. Physical department deletion is denied for every department, preserving linked employees and attendance history.

Employee add/edit uses dynamically loaded active departments. SUPER_ADMIN can open + إضافة قسم inside the employee form; creation refreshes shared department queries and selects the new department without resetting employee fields. Departments created through this shortcut are active. Loading, errors and empty departments have Arabic messages.

## Production database status

The previously prepared `202610110003_department_metadata` additive migration was required because Neon lacked `code` and `englishName`. It has now been safely applied. No additional migration is required for this page. One active مركز الاتصال / Call Center / CALL_CENTER was created with an operator audit entry. Repeating the setup command produced no writes. Administrator, employee and attendance counts were preserved; no records were deleted or reset.

## Release

Validation completed: 53 tests passed, one isolated database integration test skipped; TypeScript, ESLint and the full production build passed, including Prisma Client generation. No authenticated production browser test or deployment was performed.

Commit locally, then obtain explicit approval before pushing or deploying. GitHub main may trigger Vercel automatically. The existing production environment variables and build command remain unchanged. After release, verify authenticated Settings/Departments and employee dropdowns on the production HTTPS origin. Automated API and React DOM tests exercise permissions, validation, unique-code conflicts, deactivation, deletion refusal, search/counts and employee form preservation. Isolated database concurrency tests remain skipped unless TEST_DATABASE_URL points to a separate disposable database.
