# Earthlink Attendance System — Security Audit

Date: 2026-10-11 (Asia/Baghdad). Production: https://earthlink-attendance-system-yqix.vercel.app

## Result and scope

**Security improvements required.** No Critical finding was identified in the inspected code and limited checks. There are **2 High, 5 Medium and 4 Low findings**. This is a bounded assessment, not a guarantee that the application is free of vulnerabilities.

Reviewed source revision: `979f634`, including the existing local working-tree changes. In particular, the safer error classification in `src/lib/http.ts` is locally modified and is not part of that committed revision. The deployed commit was not independently established; production observations below are reported separately from source conclusions.

Methods: inspection of all application API handlers, authentication/session helpers, schemas, migrations, upload/export paths, protected layouts and relevant client components; local automated tests; current npm advisory checks; an exact-match secret scan; PostgreSQL catalog/privilege queries in an explicitly read-only transaction; and 17 sequential, bounded unauthenticated production requests. Production response bodies were not read or saved. No employee data or identifiers were enumerated or extracted. No login credentials were attempted. No valid attendance submissions, production mutations, migration commands, brute-force attempts, exploit payloads or load tests were performed. No fixes were deployed.

Local database metadata checks used the existing saved connection configuration previously used for the production Neon branch. They establish those credentials' privileges. Vercel's actual secret values were not retrieved; if Vercel uses a different role, its grants require separate verification. Neon project network access rules, console RBAC, backup retention and Vercel team permissions were not inspected.

## Findings

### F01 — High: Attendance can be registered by someone knowing another employee's email

- **Affected:** `src/app/api/attendance/route.ts`; `src/lib/service.ts:registerAttendance`; `/api/attendance`.
- **Evidence:** The public endpoint accepts a corporate email, finds an active employee and creates attendance without a credential or employee identity proof. The QR is a permanent public `/attendance` link. Origin checks can be supplied by a non-browser HTTP client and are not identity verification. This is already documented behavior, not a newly discovered admin authentication bypass. No production registration was attempted.
- **Impact:** Someone knowing a registered email can mark that employee present, occupy their daily registration slot, and falsify attendance. Successful registration also returns the employee's name and email to the submitter. Duplicate prevention prevents repeated active records; it does not prove who submitted the first record or physical presence.
- **Recommended fix:** Decide explicitly whether self-reported attendance is acceptable and label it accordingly. If stronger integrity is needed, approve a separate design for employee identity verification or authenticated supervisor confirmation. Do not treat the QR or corporate email syntax as proof of identity. Identity-proof changes are outside the previously approved attendance rules and were not implemented by this audit.

### F02 — High: Application database credentials have owner/migration privileges; audit logs are mutable at database level

- **Affected:** Prisma datasource configuration; runtime `DATABASE_URL`; `AuditLog` and other business tables.
- **Evidence:** Read-only inspection of the configured role returned `rolcreatedb=true`, `rolcreaterole=true`, `rolbypassrls=true`, `rolsuper=false`. It inherits owner rights and can UPDATE, DELETE and TRUNCATE `AuditLog`, `AdminUser`, `Employee` and `AttendanceRecord`. The locally saved pooled and direct connections use the same database role. No privilege or record was changed.
- **Impact:** A compromised application credential or server-side execution vulnerability would allow modification/removal of audit evidence and business records, and broader database administration. The application has no audit-log mutation endpoint, but its database principal can bypass that protection. No current SQL-injection exploit was found.
- **Recommended fix:** Separate a narrowly granted runtime role from the migration/owner role. Grant only required table operations; audit access should be SELECT/INSERT without UPDATE/DELETE/TRUNCATE. Do not grant ownership, schema DDL, role creation or RLS bypass to the runtime role. Test the grants on an isolated environment before rotating Vercel's runtime credential. Consider an independently controlled append-only audit destination. Confirm Vercel uses the intended restricted role. See [OWASP database least privilege guidance](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html).

### F03 — Medium: Shared and account-only rate limits permit targeted and system-wide lockout

- **Affected:** `src/lib/auth.ts:rateLimit`; `/api/auth/login`; `/api/attendance`.
- **Evidence:** Login uses 5 requests per email per 15-minute fixed bucket and 100 global requests per 15 minutes. Attendance uses 8 per email and 600 global per 10 minutes. There is no per-client discriminator or progressive throttling. Successful and unsuccessful attempts consume the same buckets. Syntactically valid, unknown emails reach rate-limit writes. Bucket boundaries can allow a burst spanning two windows. Database increments are atomic; rejection at the configured limit is covered by local tests. No production quota was exhausted.
- **Impact:** An attacker can consume a known administrator's email quota or distribute requests across invented emails to consume the global quota, denying legitimate login or check-in. Rejected traffic also produces database work, and expired buckets have no scheduled cleanup in the repository.
- **Recommended fix:** Layer bounded client-level abuse controls with account-level throttling and monitored global safeguards. Use trusted proxy/client identifiers rather than arbitrary forwarded headers. Prefer progressive delay or an appropriate rolling window, alerts and safe expired-row cleanup. Keep attendance abuse throttling separate from policies restricting where employees may attend. Do not rely on Origin to stop scripted callers. See [OWASP authentication throttling guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### F04 — Medium: Production CSP permits arbitrary inline scripts

- **Affected:** `next.config.ts`; production `Content-Security-Policy`.
- **Evidence:** The live header contains `script-src 'self' 'unsafe-inline'`. It does not contain `unsafe-eval` in production. React output inspected uses text rendering; no `dangerouslySetInnerHTML`, `innerHTML` assignment or application `eval()` sink was found. No XSS exploit was attempted or established.
- **Impact:** CSP would not block an injected inline script if another injection flaw were introduced or discovered. Same-origin script execution can read displayed data and make authenticated requests, even though the session cookie is HttpOnly.
- **Recommended fix:** Plan a Next.js-compatible nonce/hash-based script policy; test hydration, scripts and exports before enforcement. Roll out with CSP reporting where appropriate. Remove `unsafe-inline` for scripts once compatibility is verified. Keep framing and base/form restrictions. See [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

### F05 — Medium: Authentication security events are not recorded or alerted

- **Affected:** `src/app/api/auth/login/route.ts`; `src/app/api/auth/logout/route.ts`; `src/lib/auth.ts`.
- **Evidence:** Login, failed-password checks, rate-limit denials and logout have no structured security-event record or alert hook. Administrative business mutations and the secure bootstrap/password reset do have audit entries. Generic exception logging is not an authentication event trail.
- **Impact:** Credential attacks, suspicious access and session abuse are harder to detect and reconstruct. This does not mean existing employee/attendance mutation audits are missing.
- **Recommended fix:** Add bounded, structured success/failure/logout and abuse events with suitable retention and access control. Never log passwords, hashes, raw session tokens, database URLs or complete submitted bodies. Avoid unbounded audit writes on every malicious request; aggregate or sample repeated denials and alert on meaningful patterns.

### F06 — Medium: Spreadsheet import bounds compressed size after accepting the body, but not decompression resource use

- **Affected:** `src/app/api/admin/export/route.ts:POST`.
- **Evidence:** `req.formData()` is parsed before checking the 2 MB file size. `book.xlsx.load(...)` runs before the 500-row check. There is no explicit archive entry count, expanded-size or compression-ratio bound. Only authenticated write roles can import; authorization precedes parsing. Platform request limits provide an additional outer bound, but a small compressed XLSX may expand much larger. No archive or resource-exhaustion payload was submitted.
- **Impact:** A malicious authorized user or compromised ADMIN account could consume excessive memory/CPU and cause serverless timeouts or costs. This is a resource-exhaustion risk inferred from the parsing sequence, not a demonstrated production denial of service.
- **Recommended fix:** Reject oversized bodies early where supported; inspect ZIP expansion/entry budgets with a safe parser; impose time/memory limits and concurrency quotas on imports. Preserve current per-row validation and all-or-nothing audited transactions. Use an isolated test environment for archive-boundary tests.

### F07 — Medium: Known denial-of-service advisory in development dependency chain

- **Affected:** `package-lock.json`; `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`.
- **Evidence:** `npm audit --json` reported 5 High package entries for one underlying advisory, [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The locked `braces` is 3.0.3 and marked development-only. The advisory lists affected versions through 3.0.3 and no patched release at audit time. `npm audit --omit=dev --json` reported zero known runtime advisories.
- **Impact:** Deeply nested brace patterns can exhaust the parser stack where that package processes attacker-controlled patterns. Contextual project severity is Medium because this observed path is development/lint tooling; no public API path to the vulnerable pattern parser was identified. Five npm package entries do not establish five separate vulnerabilities, and zero runtime advisories does not prove runtime safety.
- **Recommended fix:** Monitor the upstream patch and compatible dependency updates. Keep untrusted glob patterns out of lint/build configuration. Do not run `npm audit fix --force` or downgrade Next's lint configuration automatically: the suggested major downgrade can break the current Next.js version. Validate any replacement or override with the full test/build suite.

### F08 — Low: Record-history API exposes audit details to read roles despite the full audit API requiring SUPER_ADMIN

- **Affected:** `src/app/api/admin/[resource]/route.ts:GET`; `/api/admin/history?entityId=...`.
- **Evidence:** `audit-logs` requires `super`, but `history` uses `read`, returns AuditLog rows including old/new values, reason and actor name for Employee/AttendanceRecord, and filters by a supplied UUID. ADMIN/VIEWER can already read organization-wide employees/attendance. This is a policy inconsistency/privacy review item, not a demonstrated cross-tenant IDOR or unauthorized write. No real entity IDs or audit records were requested.
- **Impact:** Historical values, change reasons and actor identities may be visible more broadly than intended by the full-audit restriction, including historical employee details.
- **Recommended fix:** Decide explicitly whether record history is part of read-only access. If it is, return a minimized allowlisted representation and test the policy. If audit history is restricted, use the corresponding server-side permission. Introducing department/tenant scoping would require a separate authorization design; the current application deliberately uses organization-wide role access.

### F09 — Low: Sensitive JSON API responses lack an explicit no-store policy

- **Affected:** `src/lib/http.ts`; `/api/admin/*` JSON handlers.
- **Evidence:** The inspected JSON response paths do not set `Cache-Control: private, no-store`. Anonymous 401 responses in production showed `public, max-age=0, must-revalidate`. Protected page redirects showed private/no-store, and export files explicitly use no-store. No authenticated JSON response or sensitive cached response was fetched; authenticated cookie-dependent Next.js responses may receive different cache treatment.
- **Impact:** Reliance on framework/platform defaults is fragile if caching behavior changes or another intermediary is introduced. This is hardening advice; no employee-data cache leak was demonstrated.
- **Recommended fix:** Explicitly set private/no-store on sensitive authenticated API responses and applicable errors. Verify authenticated headers and Vercel caching after an approved test login, without retaining private response bodies.

### F10 — Low: Attendance confirmation PII remains in browser session storage

- **Affected:** `src/app/attendance/page.tsx`; `src/app/attendance/success/page.tsx`.
- **Evidence:** A successful response's name/email/date/time is saved as `attendance-result` in sessionStorage and read on the confirmation page. It is not cleared after display or given an application expiry. This storage contains confirmation data, not administrator session credentials.
- **Impact:** A shared browser tab or later same-origin script can access the last employee confirmation until the tab session ends.
- **Recommended fix:** Minimize the stored confirmation fields, add a short expiry and clear the value after the intended display/navigation lifecycle. Handle malformed stored JSON safely. Preserve confirmation usability without retaining unnecessary identity data.

### F11 — Low: Operator scripts can emit unredacted exception messages

- **Affected:** `scripts/admin.ts:catch`; `scripts/seed.ts:catch`.
- **Evidence:** These entrypoints call `console.error(e.message)`. The local masked bootstrap wrapper captures child diagnostics, and runtime HTTP handling logs only error names/categories, but invoking the standalone scripts directly lacks that redaction boundary. No secret-bearing error was triggered or printed during this audit.
- **Impact:** Validation/database exception details can enter terminal transcripts or CI logs; connection and operational information may be disclosed. Actual password/hash disclosure was not demonstrated.
- **Recommended fix:** Replace raw exception output with allowlisted error categories and private diagnostic handling. Do not run credential-bearing bootstrap/reset scripts in public CI logs. Keep passwords out of command-line arguments and clear temporary environment values after use.

## Controls verified and scope coverage

| Area | Evidence and conclusion |
| --- | --- |
| Authentication | Argon2id hashing and verification; generic wrong/inactive/unknown-account rejection; no default administrator credentials in application source. Local mocked correct-password and wrong-password route tests passed. No real production login was attempted. |
| Sessions | 32 random bytes per new token; HMAC-SHA256 identifier stored in Neon; eight-hour expiry; current database role/active status checked each request. Mocked production cookies verified Secure, HttpOnly, SameSite=Strict and path=/; logout revokes the current hashed token. Role changes and operator password reset revoke sessions. Live authenticated cookie behavior remains untested. |
| Roles/API access | Read: SUPER_ADMIN/ADMIN/VIEWER. Writes: SUPER_ADMIN/ADMIN. Departments/admin accounts/settings/full audit: SUPER_ADMIN mutations. QR export requires write. Anonymous live access to eight tested administrative APIs returned 401. Existing tests cover forbidden mutations, department deletion denial and audited edits. |
| IDOR | Employee/attendance mutations authorize before loading the supplied UUID; restore additionally requires SUPER_ADMIN. No anonymous mutation bypass identified. Authorized roles have organization-wide access by design; there is no department/tenant ownership boundary to claim as verified. History policy is F08. |
| SQL safety | Runtime raw SQL uses Prisma tagged templates, including row locks; object queries use Prisma parameters and Zod UUID/enum constraints. No runtime `$queryRawUnsafe`/`$executeRawUnsafe` or request-derived SQL concatenation found. Audit metadata helpers use only fixed catalog SQL in a read-only transaction. No production SQL-injection payloads were sent. |
| CSRF/Origin | All inspected mutation routes call exact `sameOrigin`; missing Origin is rejected locally. Live foreign-Origin login and attendance calls returned 403. A same-production-Origin malformed login returned 400 before rate-limit writes, showing the live origin is accepted. Origin protects browser CSRF, not authentication of scripted clients. |
| XSS | React text rendering and no dangerous HTML/eval sinks found in inspected application source. CSP weak point is F04. XLSX export uses string cells, not user-provided formula objects; no formula execution flaw was established. |
| Duplicate attendance/date integrity | Employee row lock plus partial UNIQUE index on active `(employeeId, attendanceDate)`; unique index verified through live database catalog. Server timestamp, Asia/Baghdad date and immutable original timestamp preserved. Local duplicate/day-boundary tests passed. Live registration/concurrency tests were intentionally not run. |
| Secrets | `.env*` and `.local/` ignored; only `.env.example` tracked. Current configured AUTH_SECRET/URLs/database password exact-match scan found zero matches in tracked files, reachable Git objects or the local `.next/static` build. No NEXT_PUBLIC secret use found. Live HEAD requests to `/.env` and `/.git/config` returned 404. This cannot rule out unknown/rotated secrets, provider logs or every deployed artifact. |
| Database transport | Saved pooled runtime connection requires TLS; direct URL reserved for migration use in Prisma. No connection strings or database role names are included in this report. Least privilege fails for the inspected configuration (F02). Provider IP restrictions and account security remain unverified. |
| Headers/HTTPS | Live HTTPS responses provide HSTS `max-age=63072000; includeSubDomains; preload`, nosniff, DENY framing, same-origin referrer policy, restrictive Permissions-Policy, CSP framing/base/form restrictions and no production unsafe-eval. Public/static responses carried ACAO=* without credential allowance; this alone is not authenticated CORS exposure. Protected APIs did not carry ACAO in observed responses. Some protected redirects reveal `X-Powered-By: Next.js`; minor fingerprinting, not an access bypass. |
| Audit/record protection | Business changes and audit inserts share transactions; administrative reasons validated. Password hashes omitted from admin-creation audit and admin API responses; admin listings explicitly select safe fields. Employees/attendance use soft deletion; departments cannot be physically deleted through API. Public self-reported attendance records have no authenticated actor (F01). Database-level audit immutability and auth event visibility require F02/F05 remediation. |
| Preview mode | UI preview requires NODE_ENV=development and LOCAL_ADMIN_PREVIEW=true; it does not authorize APIs and is ignored in production. Live protected routes redirected. No production preview bypass identified. |

## Actual verification results

- Baseline automated suite: **53 passed, 1 skipped**.
- With six added mocked authentication/logout audit tests: **59 passed, 1 skipped**. Tests use synthetic fixtures and mock all database access; no real password/hash/token is logged.
- TypeScript and ESLint: completed successfully during this audit.
- The skipped integration suite requires an isolated disposable TEST_DATABASE_URL. It creates/cleans fixtures and was not pointed at production. Real concurrency, authenticated role transitions, successful production sign-in/session/logout and archive-exhaustion tests remain unperformed.
- The existing production build passed in the preceding feature verification; it was not rerun for this audit because application functionality was not changed.
- Dependency advisory lookup: **5 High development-chain entries, 0 Critical; zero known runtime entries with --omit=dev**. See F07 for contextual severity.
- Production probes: **17 total**, no retries/load concurrency. GET `/admin/login` and `/attendance`: 200. GET `/admin` and `/admin/departments`: 307 to login. GET `/api/admin/{profile,employees,attendance,reports,admins,audit-logs,export,qr}`: 401. HEAD `/.env` and `/.git/config`: 404. Wrong-Origin POST `/api/auth/login` and `/api/attendance`: 403. Same-Origin malformed POST `/api/auth/login`: 400. Invalid requests stop before any application/database write in the inspected code.
- Safe diagnostic JSON is saved under ignored `.local/security-production.json`, `.local/security-database.json`, and `.local/security-dependencies.json`; these contain status/header/privilege/advisory metadata, not credentials or business records.

## Recommended order of work

1. Decide and document the accepted attendance impersonation risk (F01); obtain explicit approval before changing identity or attendance rules.
2. Prepare/test least-privilege runtime credentials and append-only audit access on an isolated environment, then obtain approval before production grants/credential changes (F02).
3. Harden abuse throttling, authentication visibility and script CSP (F03–F05) with compatibility tests.
4. Add upload expansion safeguards and plan a compatible advisory resolution (F06–F07).
5. Review history disclosure, explicit cache policy, confirmation retention and operator diagnostic redaction (F08–F11).

This audit creates only this report, local audit tests and ignored diagnostic artifacts. It does not commit/push changes, change production data/privileges, rotate credentials, or deploy fixes. Remediation requires a separate approved task.
