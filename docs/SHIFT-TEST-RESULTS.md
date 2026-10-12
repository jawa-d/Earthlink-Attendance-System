# Shift module — verification results

Date: 2026-10-12, Asia/Baghdad. Tests exercise the combined local working tree, including earlier security fixes. No deployment, GitHub push, production migration, credential/grant change or production attendance mutation occurred.

## Final checks

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`, exit0 |
| ESLint | PASS | `npm.cmd run lint`, exit0 |
| All unit/UI/security tests | **369 passed, 0 failed, 2 skipped** | 33 files passed, 2 integration files skipped; final suite10.89s |
| Production build | PASS | Prisma6.19.3 generation + Next16.4 compile/typecheck/prerender; /admin/shifts and all three new API files appear in build routes |
| Prisma schema validation | PASS | `npx.cmd prisma validate`; no connection/data operations |
| Schema-only migration diff | PASS | Baseline schema → local schema: additive tables/nullable columns/indexes/FKs only; ignored `.local/shifts-generated-diff.sql` is comparison evidence, not executed SQL |
| Built loopback HTTP checks | **19 passed, 0 failed** | Includes anonymous shift list/create denial, no-store config, disabled catalog without DB lookup and labelled public selector |
| Secret/diff checks | PASS | No exact saved-secret matches/pattern findings; git diff --check clean; limited scan, not exhaustive secret certification |
| Shift PostgreSQL integration | **NOT TESTED / skipped** | No explicitly isolated SHIFT_TEST_DATABASE_URL supplied; guard requires isolation acknowledgement |
| Existing PostgreSQL concurrency integration | **NOT TESTED / skipped** | TEST_DATABASE_URL empty; no production database substituted |
| Real-browser/mobile/print validation | **NOT TESTED** | JSDOM/UI tests and generated PDF bytes do not replace visual/browser/printer checks |

The first offline schema-diff attempt encountered a UTF-8 BOM in a temporary baseline file; that file was rewritten without BOM and the diff succeeded. An intermediate lint complaint about a test variable named module was corrected; final lint is clean. Expected stderr in the existing injected audit-failure test is not a failed test. No failed-final-check is hidden as a skip.

## Coverage and files

| Tests | Demonstrated behavior |
| --- | --- |
| `tests/shift-model.test.ts` | Canonical/deduplicated codes/restrictions, invalid times/duration/IDs, overnight/month/year boundaries, midnight calendar vs schedule date, historical Baghdad DST offset, Arabic 12-hour labels, default-off gate, combined predicates and per-shift event/employee counts |
| `tests/shift-routes.test.ts` | Create/edit/deactivate/audit, duplicate409, nonexistent shift404, wrong department/invalid reason400, read search/pagination, Origin403, quota429, privacy-projected public options, disabled config and generic unavailable employees |
| `tests/security-access-matrix.test.ts` | Extended actual authorize checks for anonymous access, VIEWER writes and CSRF across new GET/POST/PATCH/DELETE shift handlers |
| `tests/shift-attendance.test.ts` | Required/permitted active shift, server-derived identity/department/times/snapshots, ignored forged fields, immutable snapshots, ordinary correction rejects shift replacement, manual snapshot/audit, legacy gate-off path and unchanged exact ten-hour cooldown |
| `tests/shift-reporting.test.ts` | Legacy visibility/null filtering, stable-ID filters, no invented unregistered roster, unique employee-day summary/all event labels, snapshot schedules, real XLSX cells and generated raw/grouped PDF exports |
| `tests/shift-ui.test.tsx` | VIEWER read-only controls, admin create/restrictions/deactivation, native time values, mandatory public selection, reset on email change, failed lookup blocks submit, server-invalidated selection refreshes/clears, default-off compatibility and historical/legacy labels |
| All existing suites | Employee/department/leader history, dashboard/calendar/counting, deletion consent/audit/fingerprint, cooldown/receipt, generic RBAC/session/Origin/headers/size/privacy and Excel/PDF regressions remain passing |
| `tests/shift-postgres.integration.test.ts` | Prepared opt-in real Prisma/route fixture flow for CRUD, overnight writes, cooldown, history preservation/deactivation, legacy/raw filters and exports; **not executed** |

Record-lock syntax and transaction placement are inspected and exercised by mocks, not proven under real PostgreSQL contention. The PostgreSQL suite needs an already migrated **disposable synthetic** target; it does not apply schema or touch the saved application database. Production-grade permission/lock/duplicate races and table CHECK enforcement still need isolated execution before release approval.

## Reproduce locally without using the saved production database

```powershell
npm.cmd run db:generate       # generates client only; no migration
npx.cmd prisma validate
npm.cmd run typecheck
npm.cmd run lint
$env:TEST_DATABASE_URL = ''
$env:SHIFT_TEST_DATABASE_URL = ''
npm.cmd test -- --reporter=dot --reporter=json --outputFile=.local/security/shift-results.json
```

The JSON report is ignored local evidence and includes only synthetic test names/events. New route/unit tests explicitly turn the feature gate on with mocked data; legacy regression cases leave it off. No real employee identity data is used.

Use a dedicated terminal/process for an isolated synthetic build:

```powershell
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/shifts_build?sslmode=require'
$env:DIRECT_URL = $env:DATABASE_URL
$env:AUTH_SECRET = 'synthetic-build-only-secret-not-for-production-0123456789'
$env:APP_URL = 'https://synthetic.invalid'
$env:QR_BASE_URL = 'https://synthetic.invalid'
$env:ATTENDANCE_SHIFTS_ENABLED = 'false'
$env:TEST_DATABASE_URL = ''
$env:SHIFT_TEST_DATABASE_URL = ''
npm.cmd run build
node scripts/security-local-smoke.mjs
node scripts/security-secret-scan.mjs
```

The smoke runner owns/stops its loopback-only server at127.0.0.1:3117, supplies unusable DB credentials and probes only anonymous/rejected/disabled-config behavior. No valid login/check-in is attempted. This artifact must **not** be deployed; rebuild under an approved release workflow with correct target environment later.

For real local module operation, provision and verify a separately isolated PostgreSQL target, review/apply pending migrations there, create synthetic admin/departments/employees/catalog and set its server gate true. Follow [the deployment checklist](SHIFTS-DEPLOYMENT.md); do not activate the gate against this workspace's saved production connection as a shortcut. Use [the module guide](SHIFT-MANAGEMENT.md) to review semantics and limitations.

## Readiness boundary

Local application implementation and stated checks are complete. Real PostgreSQL migration, lock/constraint testing, restricted-role rehearsal, browser/mobile/PDF print review, production rollout and activation require the documented follow-up evidence/approval. SEC-01 email impersonation remains OPEN; selection is not authentication. The earlier OPEN High findings still mean **NOT READY FOR SECURITY APPROVAL**, even though the module's local tests pass.
