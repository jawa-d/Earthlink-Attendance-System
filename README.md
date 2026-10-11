# Earthlink Attendance System

An Arabic-first internal departmental attendance application. Next.js App Router, React, TypeScript, Tailwind, shadcn-style Radix components, TanStack Query, React Hook Form, Prisma and PostgreSQL. This is separate from the company's fingerprint infrastructure.

## Local setup (PowerShell)

For local UI preview without a database, set `LOCAL_ADMIN_PREVIEW=true` in ignored `.env.local` and run `npm.cmd run dev`. `/admin` opens directly with empty dashboard placeholders and a preview notice. Preview pages do not query a database or allow writes. Administrative APIs continue to require real authentication. This flag is ignored in production and tests; remove it or set it to `false` before configuring real administrator sign-in.

Requires Node.js 22+ and PostgreSQL (Neon or local). No credentials or default administrator are included.

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Edit .env with your own database connection strings, random AUTH_SECRET,
# APP_URL=http://localhost:3000 and production HTTPS QR_BASE_URL.
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run admin:bootstrap
npm.cmd run dev
```

Open `/attendance` or `/admin/login`. Before bootstrap, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters. Bootstrap refuses to run if any administrator exists. Remove the bootstrap password after use. To create departments, employees and other administrator accounts, sign in as the first super administrator and use Settings. `npm.cmd run db:seed` optionally creates 12 explicitly fictional employees in a test department; run only on a development database.

On Windows, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1` for masked local credential entry. Set `LOCAL_ADMIN_PREVIEW=false` first and keep the local development server running. This wrapper invokes the existing secure bootstrap, then verifies the Argon2id hash, audit entry, real HTTP login, server-side session persistence, protected pages/APIs, and logout. Credentials live only in temporary process environment and memory; the ignored `.local/admin-verification.json` contains check names and pass/fail results only. It creates no default credentials and refuses to bootstrap if an administrator already exists. Do not rerun bootstrap after successful account creation.

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit `.env`. DATABASE_URL uses Neon's pooled hostname with a small per-process connection limit; DIRECT_URL uses its direct hostname for Prisma migrations. A local PostgreSQL URL works for both variables.

After the account exists, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1 -VerifyOnly`. Enter the existing email and password at the masked prompts. This mode never invokes bootstrap or password reset. The redacted report includes login HTTP statuses to distinguish rejected credentials from server failures. Restart `npm.cmd run dev` after changing database connection configuration: a development Prisma client cached before configuration can retain its old initialization state.

## Behaviour and permissions

- Public check-in accepts only normalized syntactically valid addresses at the exact `earthlink.iq` domain, belonging to an active, nondeleted employee. Unknown, inactive and deleted employees receive the same failure response.
- **Self-reported check-in does not verify identity or physical presence. Anyone who knows a registered email may submit it.** There are no employee passwords, OTPs, location checks or network restrictions.
- The server supplies the timestamp. UTC timestamps and the Asia/Baghdad calendar date are stored separately. QR registrations always start PRESENT. No automatic lateness or absence assignment.
- An employee row lock and PostgreSQL partial unique index prevent duplicate active daily attendance, including concurrent requests. Deleted records remain historical; an authorized new record can coexist with a deleted one. Restoration conflicts return HTTP 409.
- ADMIN can manage employees and attendance and export reports/QR. VIEWER can read attendance, employees and reports. SUPER_ADMIN also manages departments, administrators, settings, audit logs and attendance restoration. APIs enforce these permissions independently of UI controls.
- Attendance status edits preserve check-in time unless a time correction is supplied. `originalCheckInAt` remains unchanged. Every administrative mutation requires a reason and commits its audit entry in the same transaction.
- Employee and attendance deletions are soft deletions. Employee identifiers and emails remain reserved to preserve historical ownership.
- Sessions expire after eight hours; only an HMAC of the random token is stored. Production cookies use Secure, HttpOnly and SameSite=Strict. Requests that mutate data must match APP_URL via Origin, including public registration.
- Login and public submission rate limits are stored atomically in PostgreSQL and shared across serverless instances. Public limits use email plus a global ceiling; they are not attendance IP restrictions. Expired rate-limit rows may be cleaned periodically with `DELETE FROM "RateLimit" WHERE "expiresAt" < now()` by the database operator.
- Audit records have no delete/update application endpoint. Database owners retain operational access; use separate least-privilege application and migration database roles for production.
- Missing registration reports reflect currently active employees that existed by the selected date. Historical employment intervals are not modeled, so these are not payroll-grade retrospective absence reports.

## Imports and reports

Export Employees provides an XLSX template. Import the first worksheet with exact first five columns: `employeeNumber`, `fullName`, `normalizedEmail`, `departmentId`, `status` (ACTIVE or INACTIVE). Department UUIDs are visible in Settings and included in exports. Maximum 500 employees and 2MB per file; import is all-or-nothing and duplicates are rejected. Only authorized administrators can import.

Reports accept a date range up to 366 days, department, employee and status filters. Excel has Arabic headers, widths, filters and a summary sheet. A4 PDFs embed the included OFL-licensed Noto Sans Arabic font, repeat table headers across pages and include generation time. Verify Arabic layout and printer output on your target PDF viewer before rollout; visual browser/printer checks are separate from automated generation tests.

The QR contains only `${QR_BASE_URL}/attendance`. Configure a stable HTTPS production origin; localhost and HTTP are rejected. It does not rotate. PNG uses 1600px output and four-module quiet margins; A4 PDF and browser print are available. Changing the production URL requires replacing printed posters.

## Approved password reset

There is no public password-reset endpoint. An authorized infrastructure operator verifies the request through the organization's approved identity process, temporarily sets BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in a trusted terminal environment, then runs:

```powershell
npm.cmd run admin:reset
```

This updates the Argon2id password hash, revokes every session and appends a password-reset audit event. Remove the temporary password immediately. Never place it in shell arguments, tickets or source control.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Unit tests cover email normalization and domain deception, unavailable employees, duplicate rejection, Baghdad midnight, roles, session hashing, Origin validation, Argon2id, manual validation, XLSX, PNG and embedded-font PDF generation.

For real concurrency/transaction integration tests, provision an **isolated disposable** PostgreSQL database, apply the checked-in migrations to it, set TEST_DATABASE_URL to that connection, then run `npm.cmd run test:integration`. The suite creates and cleans its own records and verifies 12 concurrent submissions, original timestamps, transactional audit writes, soft deletion and conflicting restoration. Without TEST_DATABASE_URL this suite is explicitly skipped. Do not point it at production.

## Vercel preparation (no automatic deployment)

1. Create a Neon project and isolated development branch. Configure pooled DATABASE_URL and direct DIRECT_URL, both with SSL. Validate migrations and integration tests on the development branch first.
2. Import this repository into Vercel as Next.js with Node.js 22 or 24. Build command: `npm run build`; install command: `npm ci`. No custom output directory.
3. Configure DATABASE_URL, DIRECT_URL, AUTH_SECRET (32+ random characters), APP_URL and QR_BASE_URL for each deployment environment. APP_URL must equal the visited origin; preview environments need their own exact URL. Keep production QR_BASE_URL stable.
4. Run `npm run db:migrate` against the intended production branch from a trusted operator terminal or dedicated migration job. Do not run migrations on every serverless request or preview build.
5. Run first-admin bootstrap against that database from the protected terminal, then remove bootstrap password configuration. Log in, add departments and employees, and confirm access for each role.
6. Deploy only when explicitly requested. Check mobile public registration, duplicate rejection, every administrative role, filtered exports, Arabic PDF layout and printed QR scanning. Run live database checks and the concurrency suite on an isolated branch.

The included font is licensed under the SIL Open Font License in `public/fonts/OFL.txt`. No official Earthlink logos or external brand assets are used.
