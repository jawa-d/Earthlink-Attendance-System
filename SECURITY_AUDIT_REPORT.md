# Earthlink Attendance System — production security audit

Subsequent local feature: [Shift Management](docs/SHIFT-MANAGEMENT.md) adds three API route files, historical snapshots and additional tests. The inventory/test counts below describe the audit baseline before that feature; consult its [results](docs/SHIFT-TEST-RESULTS.md) and [release checklist](docs/SHIFTS-DEPLOYMENT.md) for current module evidence. SEC-01 and the other OPEN High findings remain unresolved. Neither local change set has been deployed.

**Date:** 2026-10-12, Asia/Baghdad. **Repository:** jawa-d/Earthlink-Attendance-System. **Baseline:** `26a9bcc52f7a905a8e736681a2c2e2c7eac529ac`; findings distinguish that baseline, local remediation, and the deployed baseline. **Decision: NOT READY FOR SECURITY APPROVAL.** High risks remain open.

## 1. Executive summary

Server-side administrative authentication and role checks are present across all inspected handlers, and the expanded test matrix denies anonymous access, VIEWER writes, ADMIN super-admin operations and cross-origin mutations. No working anonymous admin bypass, SQL injection or stored XSS was demonstrated. That is a bounded result, not a guarantee of absence.

Three application/database High findings require approval or infrastructure work: email-only employee impersonation, excessive privileges on the configured database principal, and no current-password/MFA step-up for administrator creation or privilege changes. One additional High advisory affects the development dependency chain, with no published upstream patch as checked on the audit date. Medium weaknesses include shared rate-limit denial of service, broad inline-script CSP, expensive unbounded reports and missing QR configuration. Request buffering, XLSX decompression exposure and cache controls received local code fixes with regression checks. Authentication events now produce redacted structured telemetry; alerts, retention and an independent log destination still need configuration.

**No code was pushed or deployed during this audit. No production data, database grants, credentials, DNS or hosting settings were changed.** The APP_URL production repair/redeployment earlier in this conversation predates this audit and is separately documented below.

## 2. Overall posture and trust boundaries

Installed/locked stack: Next.js 16.4.0, React/react-dom 19.3.0, Prisma/client 6.19.3, @node-rs/argon2 2.2.2, ExcelJS 4.4.0, pdfmake 0.2.23 and Zod 4.6.5; host Node 24.16.0 and Vercel configured for 24.x. All inspected resolved lockfile packages used registry.npmjs.org and had integrity metadata. Integrity does not prove publisher trust or absence of malicious code. npm outdated identifies newer Prisma/pdfmake/ESLint/TypeScript majors; they were not installed blindly or assumed compatible. Same-range candidates include react-query 5.104.2 and Zod 4.6.6; no advisory was resolved by changing unrelated packages. Support lifecycle for every dependency is NOT VERIFIED independently of the advisory check.

The browser is untrusted. Admin tokens are random 256-bit bearer values; the database stores their HMACs. Every sensitive API checks the live admin account/role, rather than trusting a client role field. All roles currently have organization-wide employee/report read access; there is no department-scoped administrator or team-leader identity model. Team leaders are data entities, not login principals.

Prisma runtime access is a separate trust boundary. A single runtime credential necessarily reads admin password hashes, sessions and business tables, even when the UI restricts a VIEWER. Database grants cannot substitute for application RBAC or stop all damage after server compromise. Audits share the same database and principal; owner access is particularly dangerous. Public attendance is deliberately self-reported and has no identity boundary before it writes a record.

Statuses used below: **FIXED AND VERIFIED** means locally implemented and exercised; it does **not** mean deployed. **FIXED BUT NOT VERIFIED** means changed without adequate execution evidence. **OPEN** means confirmed remaining risk. **REQUIRES MANUAL REVIEW** means a policy/infrastructure decision or inspection is needed. **NOT TESTED** means no execution evidence. For unavailable external controls, **NOT VERIFIED** is stated explicitly under REQUIRES MANUAL REVIEW/NOT TESTED.

## 3. Complete externally accessible functionality inventory

Source: all route files under `src/app`; there are 13 API route files. Next automatically handles OPTIONS and GET-derived HEAD as applicable. Unsupported application methods have no handler. No Server Actions, middleware/proxy, webhook, public health endpoint, employee login, arbitrary fetch URL, or public file-storage endpoint was found. Static fonts and bundled assets are public. Framework RSC/prefetch and `/_next/*` endpoints remain part of the Next.js surface.

### Pages

| Route | Access and behavior |
| --- | --- |
| `/` | Public redirect to `/attendance` |
| `/attendance` | Public email form; loads receipt-scoped cooldown |
| `/attendance/success` | Public; shows the current tab's stored receipt, not a server-verified identity page |
| `/admin/login` | Public credential form |
| `/admin` | Server-protected dashboard; anonymous redirect to login |
| `/admin/employees`, `/admin/attendance`, `/admin/reports`, `/admin/profile` | Authenticated roles; mutations are independently checked by APIs |
| `/admin/audit-logs`, `/admin/settings` | SUPER_ADMIN; other roles receive not-found |
| `/admin/qr` | ADMIN/SUPER_ADMIN |
| `/admin/departments`, `/admin/team-leaders` | Authenticated pages; API applies mutation permissions |
| `/admin/[unknown-section]` | Not-found after session check |
| Local preview | Only `NODE_ENV=development` + explicit flag; empty UI placeholders, no API authorization bypass; production ignores flag |

### Public/auth APIs

| Method/path | Inputs, checks and effect |
| --- | --- |
| POST `/api/auth/login` | Exact trusted Origin, bounded JSON email/password, per-email/global quotas, Argon2 verification, active-account check, new eight-hour session |
| POST `/api/auth/logout` | Trusted Origin; deletes current token HMAC session and client cookie |
| POST `/api/attendance` | Trusted Origin, bounded corporate email JSON, quotas, active/nondeleted employee, locked ten-hour cooldown; creates QR attendance and encrypted receipt cookie |
| POST `/api/attendance/cooldown` | Trusted Origin; encrypted receipt only; no arbitrary email/ID lookup; per-receipt quota only after a valid receipt; returns unknown/ready/cooldown/unavailable |
| DELETE `/api/attendance/cooldown` | Trusted Origin; clears receipt cookie, not attendance/cooldown database state |

### Administrative APIs

All require a live active, nonexpired server session. All mutations require exact trusted Origin. Role abbreviations: R = VIEWER/ADMIN/SUPER_ADMIN; W = ADMIN/SUPER_ADMIN; S = SUPER_ADMIN. New local HTTP wrapper adds `private, no-store` to successes, downloads and errors.

| Method/path | Minimum permission and data/effect |
| --- | --- |
| GET `/api/admin/profile` | R; only current session identity, never passwordHash |
| GET `/api/admin/history?entityId=UUID` | R; paginated Employee/AttendanceRecord audit history, including old/new values and actor name |
| GET `/api/admin/departments` | R; list/filter department metadata and employee counts |
| GET `/api/admin/employees` | R; paginated/filterable employee, department and leader records |
| GET `/api/admin/attendance`, `/api/admin/reports` | R; filtered date/event records, historical assignments and synthetic unregistered rows |
| GET `/api/admin/dashboard` | R; employee totals, daily records, trends and departmental aggregation |
| GET `/api/admin/admins` | S; administrator metadata; password hash excluded |
| GET `/api/admin/settings` | S; settings list |
| GET `/api/admin/audit-logs` | S; paginated full audit list |
| POST `/api/admin/employees` | W; validated employee/department/leader + reason; assignment and audit in transaction |
| POST `/api/admin/attendance` | W; validated manual record + reason; audit in transaction |
| POST `/api/admin/departments` | S; department metadata + reason; audit |
| POST `/api/admin/settings` | S; allowlisted setting upsert + reason; audit |
| POST `/api/admin/admins` | S; account creation, Argon2 password hash, allowlisted role + reason; audit omits password/hash |
| PATCH `/api/admin/employees/:id` | W; edit/move/deactivate/assign; locked transaction and historical assignment |
| PATCH `/api/admin/attendance/:id` | W for correction; S for restore; original timestamp protected, reason/audit required |
| PATCH `/api/admin/admins/:id` | S; role/active flag; refuses self-change, revokes target sessions, audit |
| PATCH `/api/admin/departments/:id` | S; department edit/deactivation; reason/audit |
| DELETE `/api/admin/employees/:id` | W; soft delete/deactivate; assignment and audit |
| DELETE `/api/admin/attendance/:id` | W; soft delete + reason/audit |
| DELETE `/api/admin/departments/:id` | S checked, then 409; physical department deletion prohibited |
| GET `/api/admin/team-leaders` | R; filtered list/department/count metadata |
| POST `/api/admin/team-leaders` | W; validated leader with active department + reason/audit |
| PATCH `/api/admin/team-leaders/:id` | W; validated edit/deactivation; prevents moving a leader with assigned employees |
| DELETE `/api/admin/team-leaders/:id` | W checked, then 409; use deactivation/reassignment |
| POST `/api/admin/team-leaders/:id/reassign` | W; active target in same department; transaction, employee locks, histories/audits |
| GET `/api/admin/team-leader-reports` | R; grouped historical attendance + paginated detail |
| GET `/api/admin/export` | R; employee XLSX template or attendance/leader XLSX/PDF; filters |
| POST `/api/admin/export` | W; bounded multipart XLSX import, archive budgets, <=500 rows, validated employees, transactional histories/audits |
| GET `/api/admin/qr` | W; configured static attendance URL as JSON/data URI, PNG or PDF |
| POST `/api/admin/attendance-deletion` | S; prepare/export/reauthenticate/verify snapshot commands; session-bound, quotas and time limits |
| DELETE `/api/admin/attendance-deletion` | S; exported snapshot receipt, password reauth within five minutes, verified code, backup consent/reason, locks/fingerprint, SERIALIZABLE deletion + durable audit |

Unknown generic resources fail with 404. There is no AuditLog POST/PATCH/DELETE implementation. Employee/attendance entity history is intentionally broader than the full audit-log UI; confidentiality policy requires manual review rather than calling this an established bypass. Likewise W may manipulate organization-wide employee UUIDs by design, while cross-admin snapshot ownership is enforced.

Operator-only scripts are not HTTP endpoints: bootstrap/reset, seed, department setup, database checker and verification helper. They run with their configured database credential; trusted terminal access is essential. `scripts/seed.ts` guards NODE_ENV, but that alone does not prove a database is isolated. Do not run seed/bootstrap/reset/legacy verification during an audit of production.

## 4. Confirmed vulnerability register

| ID | Severity | Finding | Current status |
| --- | --- | --- | --- |
| SEC-01 | HIGH | Email-only attendance impersonation and successful-response identity disclosure | OPEN |
| SEC-02 | HIGH | Configured DB principal has owner/migration privileges and can erase audit evidence | OPEN |
| SEC-03 | HIGH | Administrator creation/role changes lack recent-password/MFA step-up | OPEN |
| SEC-04 | HIGH (advisory; dev tooling) | braces dependency stack exhaustion, no published patch | OPEN |
| SEC-05 | MEDIUM | JSON/multipart buffering before application size limits | FIXED AND VERIFIED locally |
| SEC-06 | MEDIUM | XLSX compressed-file limit did not bound expanded archive | FIXED AND VERIFIED locally |
| SEC-07 | MEDIUM | Account/global quotas allow targeted/system-wide lockout and DB work | OPEN |
| SEC-08 | MEDIUM | Production script CSP allows unsafe-inline | OPEN |
| SEC-09 | MEDIUM | Unbounded report/export aggregation and no read-workload throttle | OPEN |
| SEC-10 | MEDIUM | No auth success/failure/authorization telemetry | FIXED AND VERIFIED for local emission; alerting OPEN |
| SEC-11 | MEDIUM | Sensitive API successes/errors lacked consistent no-store policy | FIXED AND VERIFIED locally |
| SEC-12 | MEDIUM (configuration) | Missing QR_BASE_URL in accessible production environment metadata | OPEN |
| SEC-13 | LOW | Missing/unsafe production Origin configuration silently fell back to localhost | FIXED AND VERIFIED locally; earlier live APP_URL correction already verified |
| SEC-14 | LOW | Nonfinite/fractional/unbounded pagination reached Prisma or report code | FIXED AND VERIFIED locally |
| SEC-15 | LOW | Raw operator-script exception messages can reveal internal details | FIXED AND VERIFIED locally |
| SEC-16 | LOW | Framework identifier exposed; plugin restrictions absent from CSP | FIXED AND VERIFIED locally |

No Critical vulnerability was demonstrated. This severity count is not a complete enumeration of all possible defects.

## 5. Scenarios, evidence, affected locations and impact

### SEC-01 — employee identity is not verified

`src/app/api/attendance/route.ts:7`, `src/lib/service.ts:31`, `src/lib/validation.ts:61` (QR URL), and `src/app/attendance/success/page.tsx:14`. A caller who knows another active employee's email can submit it from a scripted HTTP client with the expected Origin, create attendance and learn the employee's name/email from the response. The encrypted receipt is issued **after** this unauthenticated operation and on cooldown conflict, so it does not authenticate the first submitter. Static QR, corporate email syntax and ten-hour cooldown do not prove identity or physical presence.

`tests/security-attendance-boundary.test.ts` reproduces successful registration with a synthetic employee and only an email. Its passing test intentionally documents an **OPEN** issue; it does not assert that impersonation is blocked. No production employee email or valid check-in was tested. Options and rollout are in SECURITY_FIXES.md. Business logic remains unchanged pending approval.

### SEC-02 — excessive runtime database principal

`prisma/schema.prisma:4`, `src/lib/db.ts:3`, `scripts/security-metadata.ts:25`. A fresh read-only catalog transaction returned `rolsuper=false`, `rolcreatedb=true`, `rolcreaterole=true`, `rolbypassrls=true`, `rolinherit=true`; the principal inherits table ownership, schema CREATE and SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER on AdminUser, Employee, AttendanceRecord, AuditLog and `_prisma_migrations`. A compromised credential or server execution flaw would expose business data, password hashes and sessions and permit evidence destruction. No SQL injection was demonstrated and no privileged operation was executed.

These results establish the **locally configured saved principal's** effective privileges. Vercel encrypted secrets were not retrieved; whether its runtime uses exactly that principal is **NOT VERIFIED**. Both local connection modes require TLS and pooled runtime/direct operator hosts were present. Owner privilege was previously reported and is independently reconfirmed, not assumed from the old report. Separate role SQL/rollback proposals are under `docs/security/`; they have not been executed or database-verified.

### SEC-03 — persistent privilege changes using a stolen live session

`src/app/api/admin/[resource]/route.ts:396`, `src/app/api/admin/[resource]/[id]/route.ts:138`, `src/lib/auth.ts:50`. These routes correctly require SUPER_ADMIN but have no recent-password/MFA challenge. Someone who acquires a live super-admin session can create another super-admin account or change a different account's privileges for persistence without knowing the current administrator password. This is a session-compromise amplification gap, not an anonymous authorization bypass. A synthetic route test proves account creation using only a valid session and the new account's password. Eight-hour absolute expiry increases the useful window; no inactivity timeout or MFA is implemented. Permanent attendance deletion already has password step-up, but that snapshot approval cannot be reused for account management.

### SEC-04 — development dependency advisory

`package-lock.json` resolves `eslint-config-next@16.4.0 -> @next/eslint-plugin-next@16.4.0 -> fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`. npm audit reports five High **package entries from one root advisory**, not five distinct application exploits. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists <=3.0.3 affected and no patched version as checked on 2026-10-12. The risk is stack exhaustion in pattern processing during development/lint workflows. No route was found passing HTTP input into these globs, and runtime-only npm audit reports zero current advisories. npm's suggested eslint-config-next 14.2.35 downgrade is a major incompatible change for Next 16; it was not applied. Protect CI from untrusted configuration/pattern input, monitor upstream, and test a compatible fix when available. An advisory with no patch cannot be marked remediated because production audit is clean.

### SEC-05/06 — request and XLSX processing budgets

Baseline JSON handlers used `req.json()` without application limits; import used `req.formData()` before checking file.size, and ExcelJS expanded ZIP before checking worksheet rows. `src/lib/request-body.ts:8` now enforces declared **and streamed actual** bytes: 64 KiB ordinary JSON (256 KiB for the supported 5000-ID deletion selection), 2,100,000 bytes multipart envelope, then the existing 2,000,000-byte XLSX file cap. Malformed/nonobject JSON returns 400; wrong media types 415; oversize 413. All JSON mutation routes use the helper. Authentication/Origin checks still precede sensitive admin parsing.

`src/app/api/admin/export/route.ts:124` now validates the archive before ExcelJS. `src/lib/xlsx-safety.ts:10` limits 200 entries, 8 MiB per expanded entry, 16 MiB total; it checks ZIP layout, names/offsets/overlap and actual bounded inflate output, rejecting encrypted/multidisk/ZIP64/unsupported methods, traversal names, macros and XML entity declarations. Tests include a small compressed >8 MiB payload and forged directory size claims; no large/production attack was run. A real 500-row workbook still loads. These controls bound accepted data; they do not replace host ingress limits, parser isolation, CPU deadlines or report budgets.

### SEC-07 — denial of service through quotas

`src/app/api/auth/login/route.ts:18`, `src/app/api/attendance/route.ts:13`, `src/lib/auth.ts:64`. Login allows 5/email/15 min and 100/global/15 min; attendance 8/email/10 min and 600/global/10 min. Quotas are atomic and shared but consume attempts before proving identity. An attacker can spend a known account's allowance or vary valid-format emails to exhaust the global quota. No trusted client-level discriminator, rolling window, progressive delay or pre-database WAF filter exists in source. RateLimit rows, Session rows and deletion snapshots need reviewed retention/cleanup. Do not test by exhausting production quotas.

### SEC-08 — inline-script CSP

`next.config.ts:25`; live HEAD /attendance confirmed unsafe-inline on scripts, no unsafe-eval. React text rendering tests found no executable markup from employee/audit inputs. CSP remains weaker if an XSS flaw emerges. A nonce rollout requires dynamic rendering, request/response nonce agreement and hydration checks; blindly deleting unsafe-inline would break the app. Use the [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy) with the installed Next 16.4 local guide before implementation. object-src none was safely added locally.

### SEC-09 — bounded dates are not bounded report workloads

`src/lib/attendance-list.ts:48`, `src/lib/leader-report-service.ts:38`, `src/lib/leader-report.ts:108`, `src/app/api/admin/[resource]/route.ts:179`, `src/app/api/admin/export/route.ts:27`. Export reads all matching records; unregistered reports materialize employee/day rows; leader reports fetch employees, histories and attendance before slicing; dashboard fetches many rows before grouping. Date ranges are bounded but employee count, event count, expanded output and query concurrency are not. An authorized VIEWER can repeat expensive reads, consuming CPU/memory/DB connections. No production load test was performed. Approve bounded export/report semantics, projection, quotas, cursor/background jobs and query timeouts before changing output completeness.

### SEC-10/11 — detection and cache control

`src/lib/security-events.ts:6`, `src/lib/auth.ts:38`, auth route helpers now emit fixed JSON events for successes/failures/logout/authorization/rate denial, optionally keyed by a secret-HMAC pseudonym. Tests confirm logs do not contain raw identity or request data. This is local emission only: durable retention, correlation, ingress-denial logs, exports and alerts are still infrastructure work. Existing transactional business audits remain intact.

`src/lib/http.ts:11` now enforces private, no-store for all wrapped API responses including errors and downloadable reports/QR. Tests and the loopback production server exercise actual response headers. This addresses missing cache directives; no actual production cross-user cache disclosure was demonstrated. Next marks protected pages dynamic; live anonymous /admin already returned private/no-store.

### SEC-12/13 — deployment URL settings

Read-only Vercel project/env metadata shows APP_URL scoped to production with the correct public origin, DATABASE_URL/DIRECT_URL/AUTH_SECRET shared across production+preview, and **no QR_BASE_URL entry** in the accessible project environment list. Since `qrUrl()` requires it, QR generation has a known configuration gap; the authenticated live QR route was not called. Scope-specific encrypted values and build artifacts are not inspected. Preview mutation Origin config and production/preview database separation require manual review.

Earlier this session the production cooldown returned 403 because APP_URL was absent; the approved-in-context repair added it and redeployed the same commit before this audit started. The current audit did not repeat that mutation. Local `src/lib/http.ts:45` now returns 503 if production APP_URL is absent, malformed, insecure HTTP or credential-bearing rather than silently accepting the localhost fallback. The configured Origin remains the sole allowed browser origin; Host and forwarded headers cannot enlarge it. Native HTTP clients can still set Origin: this is CSRF defense, not identity proof.

### SEC-14/15/16 — smaller hardening gaps

`src/lib/validation.ts:13` and list/report routes now reject invalid/nonfinite/fractional pages and cap pages at 1,000,000 before processing. Very large finite pages can still be costly without cursor pagination. Baseline `scripts/admin.ts:67` and `scripts/seed.ts:28` printed raw exception messages, which could include private database details. Both now use `scripts/operator-error.ts:4`; a synthetic private-URL exception test confirms no raw diagnostics are logged. Their failure paths were not triggered against production. Route error redaction is tested independently. `next.config.ts:3` removes X-Powered-By locally; HSTS and object-src none are added/tested for future VPS use. Live /admin still advertises Next.js because the local changes have not been deployed.

## 6. Potential risks requiring verification

| Control/risk | Status and evidence gap |
| --- | --- |
| Runtime Neon principal equals audited local principal | REQUIRES MANUAL REVIEW — encrypted Vercel connection values not read |
| Neon console MFA, project roles, IP allowlists, API-key scope, branch retention, PITR, audit destinations | NOT TESTED / NOT VERIFIED — no project-console/network/backup metadata was inspected |
| Database certificate/hostname validation, proxy-to-Postgres TLS | REQUIRES MANUAL REVIEW — local URL says sslmode=require; pooled pg_stat_ssl returned false/null, which cannot establish the client-to-Neon TLS state because TLS may terminate upstream. Do not call this proof of plaintext client traffic or verified end-to-end TLS |
| Preview data isolation | REQUIRES MANUAL REVIEW — same secret entries target production and preview; no separate branch URL verified |
| Vercel WAF/rate limits, bypass tokens, org MFA, access log retention, deploy permissions | NOT TESTED / NOT VERIFIED — project protection summary is not a full firewall/account audit |
| DNS registrar, nameserver delegation, ownership validation, stale CNAME/MX, takeover resistance, DNSSEC/CAA | NOT TESTED / NOT VERIFIED — no registrar/DNS-provider settings accessed; default vercel.app hostname has no app-managed DNS config in repo |
| Last-active SUPER_ADMIN and simultaneous role changes | REQUIRES MANUAL REVIEW — self-edit forbidden, but no transactional last-active-super-admin invariant; multiple sessions could disable each other |
| Login/session race with simultaneous account disable/role edit; request in flight after logout | NOT TESTED — account status is checked each new request; no claim of atomic revocation for already authorized in-flight work |
| Audits/backup snapshots retain employee data after permanent record deletion | REQUIRES MANUAL REVIEW — intentional recoverability/evidence; define access, retention and privacy policy |
| Employee/attendance entity-history read access for VIEWER | REQUIRES MANUAL REVIEW — implemented UI behavior; full audit-log endpoint stays super-only |
| Browser logout/back-cache, shared device receipt/name persistence | NOT TESTED visually — server session revocation tested, sessionStorage can retain prior employee result until tab closure |
| Complete historical secret detection, CI settings, malicious packages | NOT TESTED comprehensively — exact saved-secret scan and bounded patterns are partial controls |

## 7. OWASP application/API review and negative findings

| Category | Actual code/controlled evidence and limits |
| --- | --- |
| Broken access control / BOLA / function-level auth | Actual authorize + synthetic sessions tested at every handler; snapshot tests reject another actor/session. Organization-wide R/W is current policy, not per-department isolation |
| Injection / SQL | All inspected raw SQL is tagged or Prisma.sql/Prisma.join with values bound; no RawUnsafe, string-built SQL or client sort field escape found. Synthetic invalid email/operator and malformed UUID/pagination are rejected. A parameter-shape test is not a live database injection proof |
| XSS / output encoding | Employee/audit names and reasons rendered as React text; jsdom tests observe no script/img/svg nodes. No innerHTML/dangerouslySetInnerHTML/eval/new Function sink found. CSP gap remains |
| CSRF / CORS / host trust | Exact configured Origin on every mutation; missing/null/deceptive/port/scheme origins denied; cookie Strict. No application credentialed wildcard CORS. Public page wildcard ACAO observed; not evidence of authenticated data CORS exposure |
| Mass assignment / prototype pollution | Schemas select/strip fields; admin writes explicitly project roles/hash/timestamps; employee reassignment validated. JSON/operator inputs tested; no custom prototype merge or executable deserialization sink found |
| SSRF / path traversal / redirects | No HTTP URL supplied by a user is fetched server-side. Fixed QR route and local font path; redirects fixed to attendance/login. XLSX filenames are checked and never extracted to disk. PDF image comes from server-generated QR |
| Credentials/session | Argon2id, no seeded default admin, HMAC tokens, 256-bit random session, production Secure/HttpOnly/Strict, eight-hour absolute expiry, logout database revocation; MFA/idle timeout/step-up gap remains |
| Audit/integrity | Reason and audit write in same administrative transaction; ordinary deletes are soft; high-risk deletion fingerprint/one-time consent/locks; app has no audit mutation route, but DB owner can erase it |
| Spreadsheet formulas / unsafe export | Shared XLSX exporter test preserves formula-like strings as String cells without formulas/links. Other export builders also add string cells. No CSV export. Imported cells are not executed; spreadsheet parsing budgets now checked |
| Errors/info leakage | Routes redact Prisma exceptions and tested generic error responses; sensitive cache directives fixed. Operator logs still need redaction; Zod path/details carry no supplied input values in inspected usage |
| Resource consumption | JSON and archive budgets tested; valid 500-row import works. Report concurrency/data cardinality, slow request ingress, rate bucket growth and platform limits remain review items |
| Supply chain/config | Lockfile inspected, audit run; dev High advisory open. No .github Actions workflow exists in tracked repository; remote branch protections, workflows/settings/tokens NOT VERIFIED |

## 8. QR attendance integrity and secure alternatives

Cooldown is ten hours from successful **server** registration, under Employee row lock and a durable Employee timestamp; legacy original QR timestamps bridge rolling deployments. Soft deletion and edits do not reset it. Multiple same-day events after ten hours are intentional. Tests cover exact boundary, Baghdad midnight, active/nondeleted employee, conflicts, legacy rows and accepted/ignored fields. Receipt clear only changes a cookie. No QR nonce/rotation, replay token or employee verification exists. A repeat after the allowed window is expected behavior, so permanent duplicate prevention is not a business requirement.

Employee creation/import/reassignment verifies active department and same-department active leader; recordAssignment preserves next-Baghdad-day effective history. Public check-in does not check department isActive/leader isActive separately; decide whether an active Employee remains eligible after department/leader deactivation. This policy was not changed. Successful public events are persisted but do not have an independently authenticated actor audit; IP/device/presence evidence is unavailable.

Preferred improvement is individual employee SSO/session identity with email mapped on the server. If organizational SSO is unavailable, verify possession via a short-lived, single-use OTP/link before recording attendance, with quotas that cannot trivially lock out a whole organization. Signed short-lived tokens need issuer verification, employee binding, expiration, audience, nonce and transactional one-time consumption. Device binding needs approved enrollment, revocation and shared-device handling; ordinary browser fingerprinting is weak proof. A rotating physical QR can add context but never independently prove identity or presence. Migration and rollback must be approved before replacing email-only behavior.

## 9. Production, domain and hosting observations

Only three nonmutating HTTP requests were made during this audit: HEAD /attendance, anonymous GET /api/admin/employees with body discarded, HEAD /admin. Results: 200; 401; 307 to /admin/login respectively. The public page served HTTPS/HSTS `max-age=63072000; includeSubDomains; preload`, nosniff, DENY framing, same-origin referrer policy and camera/microphone/geolocation disabled. These show headers at one point in time, not TLS cipher/renewal or all-route coverage. No aggressive scans, quotas, credentials, real-user data enumeration or valid attendance POSTs were attempted.

Read-only Vercel metadata: Next.js project, Node 24.x, READY production redeployment `dpl_61hwpFLEagWG5HQ2tqAE8oyjQYNf` from the audited baseline; SSO protection enabled for all_except_custom_domains, password protection disabled, trusted IP policy disabled in summary. Custom-domain production still depends on app authentication. No account membership, MFA, firewall rule set or preview bypass secret was inspected. Production build/source maps and deployed dependency lock parity were not independently fetched. Local build creates dynamic admin/API routes and public static attendance/login pages; source maps are not enabled in next.config, but deployed asset inspection is NOT TESTED.

## 10. Fixes completed and compatibility

See [SECURITY_FIXES.md](SECURITY_FIXES.md) for every modified file, regression evidence and rollout implications. No Prisma schema migration or identity/business rule change was made. XLSX processing is now stricter; large/complex/ZIP64/macro/entity-containing files may be rejected. JSON callers must send application/json objects. Invalid pagination now gives 400. Production must have an HTTPS APP_URL. These intentional compatibility changes require staging review before deployment.

## 11. Tests performed and results

See [SECURITY_TEST_RESULTS.md](SECURITY_TEST_RESULTS.md) for reproducible commands and gaps. Final suite: **301 tests passed, 0 failed, 1 skipped**; 28 files passed, one skipped. TypeScript/lint/production build pass and 14 loopback production smoke checks pass. Mocked security tests test actual route authorization rather than only a stubbed authorize result. Business/UI regression suites cover attendance, admin, departments, leaders, report and deletion workflows, including the supported 5000-ID selection under a separate 256 KiB JSON budget. Database concurrency integration is **NOT TESTED**: no isolated TEST_DATABASE_URL is configured; the integration suite is deliberately skipped. No real production login was used. Visual mobile/PDF printer and browser interaction checks remain NOT TESTED.

## 12. Neon/admin/remaining risk priorities

Before security approval: resolve SEC-01 identity policy with tested implementation, SEC-02 runtime privileges and audit protection, SEC-03 administrator step-up/MFA strategy and SEC-04 compatible advisory resolution or explicitly governed compensating-control/risk acceptance. Do not call an accepted High risk fixed. Enforce preview data separation and inspect Vercel/Neon org accounts. Review broad read-role access, snapshots retention, expensive reports and WAF quotas. Configure QR_BASE_URL and test authenticated QR generation in an isolated environment. Prove backup restoration and negative DB permission checks.

## 13. Required actions before a production release

Review local changes and compatibility notes; run authenticated synthetic staging workflows and isolated PostgreSQL concurrency/negative-permission tests. Resolve the four High findings before security sign-off, or explicitly govern any residual accepted High without marking it fixed. Add preview data isolation, correct QR configuration, bounded reports and monitoring. Obtain separate approvals for release, role/schema changes, identity migration and credentials. Follow the [production checklist](PRODUCTION_HARDENING_CHECKLIST.md) and [future VPS checklist](VPS_SECURITY_CHECKLIST.md); a working deployment is not a security approval.

## 14. Neon database risks and approval boundary

Catalog evidence confirms owner/admin flags and destructive AuditLog rights on the saved principal. Actual production secret identity, provider access controls, privileged routines/default ACLs and backup restoration remain unverified. The guarded SQL/rollback templates and isolated assertions are prepared in docs/security, outside auto-applied Prisma migrations. They are **REQUIRES MANUAL REVIEW**, not applied or DB-tested. Keep owner/migrator credentials out of ordinary runtime and preserve append-only independent audit copies. Even a restricted principal retains required access to business data and password hashes after server compromise.

## 15. Admin authentication risks

Server authorization, current account/role lookup, password hashing, session expiry/cookie flags and logout revocation are tested locally. Account creation/privilege changes lack step-up and MFA; stolen sessions remain high-impact. Inactivity timeout, last-active-super-admin invariant, recovery procedures and already-authorized in-flight revocation require review. No production passwords were attempted and no real-user data was obtained. Existing entity-history/export access for all R roles requires a confidentiality policy; it is not automatically unauthorized privilege escalation.

## 16. Domain and DNS risks

HTTPS security headers and the project's domain/protection summary were observed; no DNS-provider, registrar or certificate-renewal settings were accessed. Domain takeover, DNSSEC/CAA, nameserver changes, stale aliases/records, provider account MFA, TLS cipher configuration and preview bypass-token policy are **NOT TESTED / NOT VERIFIED**. Inspect them through the authorized provider owner before claiming hardened hosting. No attack against DNS, Vercel or third-party infrastructure was performed.

## 17. Final readiness assessment

**NOT READY FOR SECURITY APPROVAL.** Local changes improve defensible controls and pass the stated verification, but confirmed High vulnerabilities remain and production still runs the earlier build. Safe remediation and five requested artifacts are prepared for review; deployment, DB privilege changes, migrations, credential rotation and identity migration require explicit approval. This report does not certify compliance, zero vulnerabilities or guaranteed protection.
