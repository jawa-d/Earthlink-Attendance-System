# Implemented security fixes and approval-dependent work

Audit date: 2026-10-12, Asia/Baghdad. Baseline: `26a9bcc5`. **Changes exist only in this working tree. No deployment/push/migration/production mutation was performed during the audit.** Status VERIFIED below refers to local execution and the stated evidence, not production.

## Local fixes

| Finding | Files and resulting behavior | Regression evidence | Status |
| --- | --- | --- | --- |
| SEC-05 request budgets | `src/lib/request-body.ts`; every JSON mutation route uses readJson; Excel import uses readImportForm. Streamed bytes counted even when Content-Length is omitted/forged; 64 KiB ordinary JSON (256 KiB for the supported 5000-ID deletion selection), 2.1 MB multipart envelope, existing 2 MB file cap. Nonobject/malformed JSON 400, wrong media type 415, oversize 413 | security-request-body + security-attendance-boundary tests; loopback HTTP 413/400 before any DB work | FIXED AND VERIFIED |
| SEC-06 compressed workbook expansion | `src/lib/xlsx-safety.ts`, `src/app/api/admin/export/route.ts`; validate bounds and actual inflation before ExcelJS. 200 entries/8 MiB per entry/16 MiB total; malformed, encrypted, multidisk, ZIP64, unsafe names/macros/entities rejected; invalid parser result 400 | Real 500-row workbook succeeds; compressed oversize and forged central sizes fail; total budget, entry count, unsafe names and XML declarations fail | FIXED AND VERIFIED |
| SEC-10 auth telemetry | `src/lib/security-events.ts`, auth.ts, login/logout handlers; fixed JSON event names and optional secret-HMAC subject pseudonym; no passwords, tokens, email text or request bodies | security-controls redaction test plus auth route/role tests and emitted synthetic events | FIXED AND VERIFIED for emission; durable ingestion/alerts remain OPEN |
| SEC-11 cache control | `src/lib/http.ts`; all wrapped success/error/attachment responses get private, no-store | Response wrapper tests, every denied route matrix response, actual built loopback server | FIXED AND VERIFIED |
| SEC-13 trusted-origin config | `src/lib/http.ts`; production fails closed with 503 for absent/invalid/HTTP/credential-bearing APP_URL; accepted origin stays exact, never widened by Host/forwarded headers | Missing/bad origin/port/scheme/deceptive-origin/Host cases | FIXED AND VERIFIED locally |
| SEC-14 query validation | validation.ts pageNumber helper + generic/attendance/leader-report lists; integer page 1..1,000,000. Corporate/admin login email max254 | Nonfinite, fractional, negative, huge and SQL-like pagination rejected; existing business tests | FIXED AND VERIFIED |
| SEC-15 operator exception privacy | `scripts/operator-error.ts`; bootstrap/reset and seed suppress private exception messages while returning failure | Synthetic secret-bearing exception never appears in captured stderr; no script/database operation run | FIXED AND VERIFIED for reporter; real operator failure workflows NOT TESTED |
| SEC-16 HTTP hardening | next.config.ts disables poweredByHeader, adds object-src none and HSTS max-age31536000 for future hosting | Header config tests and actual built production server on loopback | FIXED AND VERIFIED locally |
| Role-separation compatibility | scripts/check-database.ts no longer requires runtime/migration usernames to match; endpoint/database must still match, pooled/direct/TLS checks preserved; required-table list includes deletion snapshots | TypeScript/lint; runtime execution of this legacy checker NOT TESTED | FIXED BUT NOT VERIFIED as a live operator check |

JSON parser replacements affect login, attendance, generic create/update/delete, deletion consent, team-leader creation/update/reassignment. Cooldown and logout do not need a payload and therefore do not parse the incoming body. Server auth/Origin checks precede sensitive admin parsing. No broad request authorization or user permission was moved into a client component.

## Compatibility and migration notes

There is no Prisma schema/data migration. Existing roles, employee identities, cooldowns, transaction locks, soft deletes, report semantics and permanent-deletion consent rules remain the same. Login password hashing and session token format/expiry are unchanged. This does **not** silently replace employee authentication or require new administrator reauthentication; those unresolved changes are separate proposals.

Clients must now send JSON **objects** with application/json (charset suffix allowed). Oversize/malformed/incorrect-media inputs fail deterministically; old third-party clients using text/plain or primitive JSON must be adapted. Valid browser forms use application/json already. Multipart callers need a proper boundary; the whole request envelope is limited in addition to the file. The valid 500-row template is regression-tested. Complex/oversize, ZIP64, macro-enabled or entity-containing Excel workbooks may now be rejected even if ExcelJS previously accepted them. Users can re-export a plain small XLSX template and split imports. No MIME filename trust is used as proof that ZIP is safe.

Previously invalid pages could be rounded/fallback or cause a 500. They now produce 400; valid pagination remains unchanged. Huge report result sets remain OPEN and are not silently truncated. Production APP_URL must be an HTTPS origin; an omitted setting now fails closed instead of localhost fallback. Local NODE_ENV development/test fallback remains available. Header changes must be tested behind the intended VPS reverse proxy. HSTS deliberately does not add preload/includeSubDomains to a future custom domain without reviewing every subdomain.

Telemetry uses AUTH_SECRET for pseudonyms with a separate domain prefix; no authentication token is logged. Changing AUTH_SECRET changes correlation keys and invalidates admin sessions/attendance receipts, so secret rotation is an independently approved operation. New console events require log retention/access policy and an alert destination. The generic operator messages reduce information leakage but may require an operator to inspect configuration privately instead of reading a detailed terminal exception.

The earlier APP_URL fix already went live before this audit; this audit's parser/header/logging changes did not. Do not deploy the local synthetic build artifacts: rebuild with approved target configuration through the normal release workflow after approval. Synthetic build and loopback smoke settings are only for verification.

## High findings that cannot be silently remediated

### SEC-01 — employee identity rollout proposal (OPEN)

Prefer an organizational employee SSO/OIDC identity. Resolve the verified subject/email to an Employee on the server, require an active employee and preserve the row-locked ten-hour cooldown. Ignore a submitted employee email when determining whose attendance to create. Require CSRF protection, session revocation and clear shared-device logout. Never derive identity from a QR URL, arbitrary Origin or caller-supplied UUID.

If SSO is unavailable, add verified email OTP/magic-link with separate hashed, short-lived, one-time challenges bound to employee/session/purpose. Use cryptographic randomness, constant-time verification, expiry, bounded attempts/send quotas and transactional consumption before attendance. Do not reveal whether an unknown email is registered through send/verify responses. Choose a reputable provider and approved sender/domain settings; do not send real messages during testing. An OTP demonstrates mailbox possession, not physical presence.

Signed employee tokens need audience/purpose, subject, issuer, expiration and nonce verification. Store/hash and consume a nonce once in the attendance transaction; a signed token alone is replayable until expiry. A rotating physical QR can be a separate short-lived context token. Device binding requires approved enrollment/recovery/revocation, not fingerprint guesses. Network restrictions require a trusted ingress chain and do not prove individual identity.

**Migration:** approve the identity/presence policy, enrollment source, delivery/SSO provider and exception workflow first. Add schema/challenge/identity records in an isolated database; test impersonation, replay, expiration, revocation, department policy and existing report/cooldown flows with synthetic people. Use an explicit rollout gate: legacy email-only mode stays visibly self-reported until cutoff, then reject unauthenticated attempts. Communicate employee sign-in requirements before enforcement. Plan for devices and account recovery. **Rollback:** revert the feature gate with explicit risk acceptance; preserve challenge/audit evidence, do not reset cooldown or delete attendance. No such migration was executed.

### SEC-02 — Neon least privilege proposal (OPEN)

Review [role rollout](docs/security/neon-role-rollout.md), [guarded SQL](docs/security/neon-least-privilege.sql) and [rollback template](docs/security/neon-rollback.sql). Fresh runtime principal: no superuser/CREATEDB/CREATEROLE/BYPASSRLS/owner/migration membership/schema CREATE. Grant only table operations used by this code: AuditLog SELECT/INSERT only; ordinary soft-deleted entities SELECT/INSERT/UPDATE; Session/RateLimit CRUD; AttendanceRecord DELETE remains needed for already authorized permanent deletion. No blanket sequence/routine/grant-option/TRUNCATE rights. Separate direct migrator owns schema objects and never runs in application requests.

Provider limits, PUBLIC ACLs, roles/functions/default privileges and exact previous ownership need review. SQL is outside Prisma migrations, guarded, not run, and not database-verified. Cutover and rollback must be rehearsed on synthetic fixtures. Do not grant owner membership back to runtime to fix a denied INSERT. Keep independent append-only audit copies and provider console MFA. Runtime can still insert false audit events after compromise; SQL append-only permissions are not cryptographic integrity or protection from the database owner.

### SEC-03 — administrator step-up/MFA proposal (OPEN)

Introduce a server endpoint that checks the **current** administrator password or IdP/MFA assertion with shared anti-bruteforce controls. Store a short-lived session-bound, purpose-bound approval server-side; preferably consume it transactionally once for account creation, permission/activation changes and recovery operations. Never trust a client boolean or timestamp. Check current session/account/role again at consumption. Return a uniform denial for stale approval; no bypass on unknown action. Keep destructive attendance's existing snapshot-bound approval separate.

**Migration:** approve required action list and MFA/IdP/enrollment/recovery policy; add approval storage in an isolated migration, adapt SettingsPage with accessible challenge prompts, then test expired/wrong-session/replayed approvals and revocation. Account-change audits must not store passwords/assertions. Coordinate all operators before making step-up mandatory. **Rollback:** disable enforcement only by approved operator release with time-limited risk acceptance; retain logs, no privilege reset or session bypass. This changes authentication UX and was not implemented/deployed without the requested review.

### SEC-04 — dependency chain (OPEN)

Current full audit and runtime-only audit are saved in docs/security. Five High package entries share one braces advisory; there is no published patched version on this date. Do not apply npm audit fix --force or downgrade eslint-config-next to v14. Keep Next/eslint versions aligned, run lint/build only on reviewed config and isolate untrusted PR execution from deployment credentials. Monitor [the upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) for a compatible release; then update minimally, regenerate the lockfile and rerun the complete checks. No dependency version was changed in this audit.

## Other open work

- Client-level/WAF quotas before database work, progressive throttling and anomaly alerts, without making a known email easy to lock out. Trusted proxy headers must be configured for Vercel or the future Nginx host; arbitrary forwarded headers are not a safe key.
- Nonce/hash CSP rollout and hydration verification, following the [installed-version-compatible CSP workflow](https://nextjs.org/docs/app/guides/content-security-policy). Do not remove inline allowance without coordinating dynamic rendering.
- Bounded reports/exports and query concurrency; cursor/background export workflows and a reviewed maximum output budget. Tests document that an ordinary export can still materialize >5000 synthetic rows.
- HTTPS QR_BASE_URL production configuration, preview-specific APP_URL and isolated preview database secrets. These settings were inspected but not changed during this audit.
- Retention/cleanup for RateLimit, sessions, deletion snapshots, employee backups and audit data; current ordinary APIs must not gain audit deletion.
- Transactional last-active-super-admin protection, session inactivity timeout, monitoring of in-flight revocation limitations, and policy review of VIEWER export/entity-history access.

No local fix eliminates the need for secure Vercel/Neon accounts, backups and scoped infrastructure access.
