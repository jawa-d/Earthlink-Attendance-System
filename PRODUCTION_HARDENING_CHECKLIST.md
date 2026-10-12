# Production hardening and security approval checklist

Date: 2026-10-12, Asia/Baghdad. **Release gate: NOT READY FOR SECURITY APPROVAL.** None of the actions below authorizes a deployment, SQL change, credential rotation or production data operation. Obtain explicit approval for those changes after preparing concrete staging evidence.

## Required before security sign-off

- [ ] Resolve OPEN High SEC-01 employee impersonation with approved identity verification and tested replay prevention; document that identity and physical presence are separate controls.
- [ ] Reconfirm the actual Vercel runtime DB principal, apply/rehearse reviewed least-privilege role plan only after approval, and prove AuditLog UPDATE/DELETE/TRUNCATE plus runtime DDL/role escalation are denied.
- [ ] Add administrator step-up for persistent privilege/account actions; enroll admin MFA and review recovery/access logs.
- [ ] Resolve dev advisory SEC-04 with a compatible verified change or explicitly governed compensating-control/risk acceptance; retain OPEN status for an accepted unresolved advisory.
- [ ] Review full local diff and security artifacts; approve a production release separately. Local fixes currently are not live.

## Authentication and application

- [ ] Enforce real server session/permission checks on every new route, action and background job. Test anonymous, expired, inactive, VIEWER, ADMIN and SUPER_ADMIN cases.
- [ ] Keep strong Argon2id hashes, unique long administrator passwords and approved reset workflow. Remove temporary bootstrap secrets after use; never seed production or use real credentials in tests.
- [ ] Review eight-hour absolute expiry, add approved inactivity timeout/recent-auth policy and session inventory/revocation. Secure/HttpOnly/Strict cookies; logout must invalidate the server session. Review browser cache/shared-device privacy separately.
- [ ] Keep exact HTTPS APP_URL; reject missing/null/wrong Origin, use only reviewed trusted host/proxy settings. Origin checks are not employee authentication.
- [ ] Stage stricter content types, JSON/multipart/archive limits, pagination and generic error/cache policies. Verify employee import using the real plain template and useful 400/413/415 feedback.
- [ ] Bound report/export cardinality/concurrency before queries and serialization; add per-session work quotas and cancellation/timeouts. Do not silently truncate financial/attendance reports.
- [ ] Keep reasons/transactional audit on mutations and deletion-consent guards. Protect the last active SUPER_ADMIN transactionally.
- [ ] Review VIEWER organization-wide read/export/history access and whether department/leader deactivation prevents public attendance.

## Neon and data protection

- [ ] Verify runtime/database/migrator role identity and grants through safe catalogs; no owner, privileged membership, CREATEDB/CREATEROLE/BYPASSRLS or schema CREATE in runtime.
- [ ] Use pooled runtime connection and direct operator migration connection. Do not deploy migrator credentials with the app; review how build-time Prisma generation obtains only the configuration it needs.
- [ ] Require TLS with certificate/hostname verification supported by the installed Prisma/driver; verify the client-to-proxy and proxy-to-compute boundaries independently. Pooled pg_stat_ssl alone is insufficient.
- [ ] Separate production and preview branches/principals/secrets. Accessible Vercel metadata currently scopes the same database secrets to both environments; values/branch separation were not verified.
- [ ] Confirm provider organization/project RBAC, MFA, API-key scope, network/IP policies and region restrictions. **NOT VERIFIED** during this audit.
- [ ] Capture exact owner/ACL/default-privilege/function policy; review PUBLIC access and SECURITY DEFINER routines before trusting append-only grants.
- [ ] Maintain encrypted backups and approved PITR retention; demonstrate restoration to an isolated database and verify immutable audit availability after recovery. Backup existence/restoration **NOT VERIFIED**.
- [ ] Define retention/cleanup and access for rate buckets, sessions, employee deletion snapshots, XLSX backups and audit evidence. Permanent attendance deletion intentionally retains audit/snapshot personal data.
- [ ] Maintain independent append-only audit/log storage with separated operator permissions and monitored access.

## Vercel, domain and network

- [ ] Review Vercel org MFA/RBAC/deploy ownership, GitHub integration access, firewall rules, preview bypass tokens and access-log retention. The read project protection summary is not a full platform audit.
- [ ] Confirm preview authentication protection and eliminate production secret/data access from untrusted branch deployments. Review all aliases and orphaned projects/custom-domain assignments.
- [ ] Set QR_BASE_URL to the intended stable HTTPS production origin after approval and test authorized QR generation; it is absent from accessible env metadata. Printed static QR remains a public navigation link.
- [ ] Configure production/preview APP_URL per exact intended origin. Avoid `*.vercel.app` or request-Host-based origin allowlists. Current production APP_URL was repaired earlier in the conversation.
- [ ] HTTPS redirect/TLS certificate validity and renewal: verify all intended domains, not just one HTTPS response. Live HSTS observed; full TLS scan/renewal **NOT TESTED**.
- [ ] Roll out nonce/hash CSP with staged reporting/hydration checks; keep nosniff, DENY/frame-ancestors, object-src none, appropriate referrer/permissions policy and no sensitive caches.
- [ ] Inspect registrar lock/MFA, authorized nameservers, stale CNAMEs/ownership validations, DNSSEC, CAA and email SPF/DKIM/DMARC as relevant. **NOT VERIFIED**; repository contains no registrar configuration.
- [ ] Test deployed source-map/debug/health exposure without harvesting private data; source-map production option is not enabled locally, actual deployed maps **NOT TESTED**.
- [ ] Apply pre-database ingress quotas/body limits/bot controls with expected employee bursts; no production load test. Alert on spikes, repeated auth failures, deletion activity and DB privilege/configuration changes.

## Supply chain and release workflow

- [ ] Use npm ci with the reviewed committed lockfile; pin runtime/tooling policy and keep supported Node/Next/React/Prisma versions. Audits currently show one dev root advisory and zero runtime advisories, not a proof of safety.
- [ ] Enable GitHub branch protection/reviews, secret scanning and dependency alerts. No tracked Actions workflow exists; remote settings **NOT VERIFIED**.
- [ ] If adding CI, read-only default permissions and reviewed action SHA pins; no production secrets in untrusted PR/fork execution, artifacts, caches or shell arguments. Deployment and migration jobs need separate approved scopes.
- [ ] Keep migrations out of normal builds/startup; reviewed migration + backups + isolated tests + explicit production approval. Never run `prisma migrate reset`, seed or db push against production.
- [ ] Run typecheck/lint/all unit/security tests/build; run PostgreSQL integration on an isolated migrated database and every negative runtime-permission assertion before approval.
- [ ] Run real browser/mobile/accessibility, QR scanning, employee enrollment, logout/back-cache and Excel/PDF printer checks on synthetic staging data. No real employee data or credential testing in previews.
- [ ] Rebuild rather than deploying this audit's synthetic local build. Verify exact team/project/commit/environment; canary, release monitoring and reviewed rollback procedures.

## After approval

- [ ] Independently approve production release, DB grants/migrations and credential rotation; prepare the exact rollback for each action.
- [ ] Check deployed denial/status/header behavior with bounded requests; test authenticated flows using an approved synthetic account/environment rather than real-user data harvesting.
- [ ] Review telemetry retention/alerts and backup restoration regularly; reassess after new APIs, role changes, dependency advisories or hosting migration.

These checklists reduce identified risks; they do not certify complete protection or replace provider account review.
