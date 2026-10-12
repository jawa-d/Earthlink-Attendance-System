# Security verification results

**Date:** 2026-10-12, Asia/Baghdad. **Baseline:** `26a9bcc52f7a905a8e736681a2c2e2c7eac529ac` plus local audit fixes. Tests used synthetic data and mocked database access, except the explicitly read-only catalog inspection. No production data or credentials were exercised through authenticated HTTP workflows.

## Final result

| Check | Result | Evidence and limits |
| --- | --- | --- |
| TypeScript `npm.cmd run typecheck` | PASS, exit 0 | Final code and tests compile |
| ESLint `npm.cmd run lint` | PASS, exit 0 | Final TS/TSX/scripts checked |
| Vitest full suite | **301 passed, 0 failed, 1 skipped**; 28 files passed, 1 file skipped | Final run duration 14.18s; JSON output in ignored `.local/security/vitest-results.json` |
| Production build | PASS, exit 0 | Prisma generate 6.19.3, Next 16.4.0 compile/typecheck/static generation; all admin/API routes dynamic |
| Built loopback production HTTP smoke | **14 checks passed, 0 failed** | `.local/security/local-smoke.json`; server bound only to 127.0.0.1, synthetic secrets and unusable DB URL |
| Full npm advisory audit | **5 High package entries / 1 root dev advisory**, 0 Critical | `docs/security/dependency-audit.json`; braces <=3.0.3 advisory, no published patch on audit date |
| Runtime-only npm advisory audit | 0 reported advisories | `docs/security/runtime-dependency-audit.json`; no guarantee of absence of undisclosed vulnerabilities |
| Local secret scan | No findings / no exact history matches for currently saved secrets | Known saved-secret matching and bounded credential patterns, no matches/secrets printed. Scope is partial, not a complete historical scanner |
| Database role catalog inspection | PASS for metadata access; **unsafe privileges confirmed** | Read-only transaction, five-second statement timeout, role/ACL/TLS metadata only; no application table records read |
| Actual PostgreSQL concurrency and privilege-enforcement tests | **NOT TESTED** | TEST_DATABASE_URL unset/empty; integration suite deliberately skipped; no available local docker/psql/postgres command found |
| Live production denial/headers | 3 bounded nonmutating requests behaved as expected | HEAD attendance 200; anonymous employee API 401 with body discarded; HEAD admin 307 to login |
| Actual browser/mobile/print and authenticated production workflows | **NOT TESTED** | No real admin/employee credentials used; DOM/UI unit checks are not real-browser E2E |

One intermediate TypeScript failure in a newly authored test's header type was corrected; the final typecheck succeeds. An expected stderr `Error` in the existing audit-failure deletion test is its injected failure path; it passed and no deletion occurred. Passing tests that deliberately document OPEN behavior are **evidence of a risk**, not proof of remediation. The advisory scan intentionally reports a remaining High issue.

## Coverage and reproducible evidence

| Security property | Tests/checks | Outcome/status |
| --- | --- | --- |
| Anonymous access at every administrative handler | `tests/security-access-matrix.test.ts`, actual authorize with mocked sessions/business DB | GET/POST/PATCH/DELETE handlers deny before business operations; denied responses no-store |
| VIEWER attempting write/super actions | Same matrix | 403; no business DB operations |
| ADMIN attempting SUPER_ADMIN actions | Same matrix + department/attendance route suites | 403; restoration super-only |
| Missing/forged/expired/disabled sessions | Matrix, auth.test.ts | 401; account/role resolved from database session, never body/query |
| Session tokens, expiry, cookies and logout | auth.test.ts, security-audit.test.ts | Fresh random token/HMAC storage; production Secure/HttpOnly/Strict; eight-hour expiry; current session delete and cookie removal |
| Cross-admin snapshot ID/session access | attendance-permanent-deletion.test.ts | Another actor/session denied; expired/consumed/stale/export-mutated approvals denied |
| Cross-admin identity/role query/body spoofing | Matrix profile and mutation cases | Session profile cannot switch identity; VIEWER role injection cannot authorize |
| CSRF | All mutation handlers in matrix, security-controls, public auth tests, loopback HTTP | Wrong/missing/null/deceptive scheme/port Origin denied; Host/forwarded headers cannot change trusted origin |
| SQL/operator injection and unsafe IDs | security-attendance-boundary, security-controls, validation/route suites | Invalid/operator email and SQL-like page rejected; accepted email binds as a tagged SQL parameter. Real PG injection execution NOT TESTED |
| Mass assignment/prototype fields | security-controls, public attendance boundary | Privilege/deletion/cooldown fields stripped; prototype remains unpolluted; client time/status/employeeID ignored for QR |
| XSS | security-rendering.test.tsx | React displays employee/department/audit attack strings as text; no executable img/script/svg nodes |
| Rate limits | auth.test.ts, security-audit.test.ts | Atomic upsert/count overflow 429; targeted/global denial-of-service design remains OPEN |
| Employee/attendance authorization and audited changes | admin/department/leader route suites, matrix | Reasons required; wrong role denied; status/time corrections preserve originals; soft deletion and audits tested |
| Unauthorized AuditLog changes | Matrix | POST/PATCH/DELETE full audit resource 404 even as super admin; database owner's separate powers remain OPEN |
| QR identity impersonation | security-attendance-boundary | **OPEN explicitly reproduced with synthetic employee and bare email**; response identity disclosure documented |
| Admin step-up requirement | Matrix | **OPEN reproduced:** session-only super-admin account creation with no current-password challenge |
| Report/export workload budget | security-reporting-risk.test.ts | **OPEN reproduced:** 5001 synthetic export rows are materialized; no load test or threshold-of-exhaustion claim |
| Cooldown, replay/duplicates and timezone | service.test.ts, cooldown API/UI, multiple-events/leader-history suites | Exact ten-hour boundary, Baghdad midnight, durable timestamp, legacy QR, edit/deletion protection; mock serialization tested, real PG concurrency skipped |
| Permanent delete consent | attendance-permanent-deletion + UI suite | Server role/Origin/session-bound snapshot, export receipt, five-minute password reauth, code, fingerprint, one-time consumption; audit failure stops deletion |
| Multipart/JSON limits | security-request-body and attendance boundary | Missing/forged Content-Length, cancellation, UTF-8 byte count, nonobject JSON, media type, real multipart and 413-before-query checks |
| XLSX decompression/archive limits | security-xlsx.test.ts | Actual 500-row XLSX accepted; small compressed large entry/forged size/total size/entry count/XML entity/unsafe names rejected |
| Spreadsheet formula safety | security-xlsx + core report suites | Shared exporter produces String cells for =/+/-/@ and tab-prefixed payloads; no formulas/hyperlinks generated. No CSV path exists |
| Sensitive response/log data | Matrix profile, attendance privacy tests, security-controls | Password hashes/internal employee UUID excluded; route/operator fake secret-bearing exceptions redacted; logs use fixed events + HMAC pseudonyms |
| Security headers/cache | security-controls and built loopback smoke | CSP object-src none, no production unsafe-eval, HSTS/nosniff/framing, no powered-by; API private/no-store. Script unsafe-inline remains OPEN |
| Local preview | preview.test.ts + source review | Production/test ignore UI-preview flag; APIs always require real auth |
| Existing workflows | All 301 tests | Attendance, departments, leaders/assignments/history, dashboard aggregation, Excel/PDF generation, management/deletion UI regressions checked; supported 5000-ID selection preserved; real-user E2E not claimed |

## Reproduce safely in PowerShell

Use the existing installed lockfile dependencies. If installation is needed, review the lockfile and use npm ci in an isolated workspace. Do not run db:migrate, db:seed, admin:bootstrap/reset or bootstrap-and-verify against production.

```powershell
npm.cmd run typecheck
npm.cmd run lint
# Explicitly prevent accidental real-database integration testing.
$env:TEST_DATABASE_URL = ''
npm.cmd test -- --reporter=dot --reporter=json --outputFile=.local/security/vitest-results.json
node scripts/security-secret-scan.mjs
```

Build with unusable synthetic DB settings so static generation cannot contact production. Keep these overrides in a dedicated terminal/process; do not overwrite a saved .env or production settings:

```powershell
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/security_build?sslmode=require'
$env:DIRECT_URL = $env:DATABASE_URL
$env:AUTH_SECRET = 'synthetic-build-only-secret-not-for-production-0123456789'
$env:APP_URL = 'https://synthetic.invalid'
$env:QR_BASE_URL = 'https://synthetic.invalid'
$env:TEST_DATABASE_URL = ''
npm.cmd run build
node scripts/security-local-smoke.mjs
```

The smoke runner starts/stops a built Next production server at 127.0.0.1:3117 with its own synthetic environment and executes only anonymous/rejected/non-DB status flows. It needs that port free. Never use the resulting synthetic build as a production artifact.

Advisory commands below contact only npm's advisory registry and make no package changes. A nonzero full-audit exit is expected while the known High advisory remains:

```powershell
npm.cmd audit --json
npm.cmd audit --omit=dev --json
```

Read-only metadata inspection is a separately authorized database connection. It uses the existing local configuration and never prints connection values or employee/admin records:

```powershell
npx.cmd tsx scripts/security-metadata.ts              # key names / safe URL properties only
npx.cmd tsx scripts/security-metadata.ts --database   # READ ONLY pg_roles/ACL/TLS metadata
```

Run the database form only on the explicitly reviewed owned target. Its checks do not validate that encrypted Vercel secrets use the same role. Do not interpret pooled pg_stat_ssl false/null as proof of plaintext client traffic or certificate validation. The metadata script does not rotate or grant/revoke anything.

## Still required before sign-off

Provision an explicitly isolated, migrated PostgreSQL database containing only synthetic fixtures. Verify its endpoint/database is distinct from production, then set TEST_DATABASE_URL and run the existing integration suite. A different URL string alone is insufficient isolation. Review the destructive fixture cleanup in that suite before execution. Rehearse proposed grants and negative AuditLog/DDL/role permission probes in the disposable database with rollback. No fresh Neon branch or database migration was created during this audit.

Run authenticated employee/admin/leader/report flows in synthetic staging and real browsers, with approved enrollment/recovery cases; test CSP nonce hydration, mobile QR, logout/back cache and printed PDFs. Review Vercel/Neon account access, secrets scope, DNS, backup/PITR, logs/alerts, source maps and future VPS settings independently. Current local unit/HTTP success is insufficient for security approval while the High findings remain OPEN.
