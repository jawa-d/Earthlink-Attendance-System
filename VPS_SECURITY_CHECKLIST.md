# Future Ubuntu VPS security checklist

Planning artifact only; no VPS was accessed or changed. Date: 2026-10-12, Asia/Baghdad. Every actual control below is **NOT TESTED / NOT VERIFIED** for the future host. Choose a currently supported Ubuntu release and verify installed-version documentation at implementation time. Do not copy a firewall/SSH change blindly or lock out the existing administrator.

## Host access and patching

- [ ] Inventory the owner, provider rescue console, DNS, service account and backups. Use a reviewed base image and supported Node/runtime packages; document patch/incident responsibilities.
- [ ] Create a named non-root sudo operator; enroll strong SSH keys and verify a second live session/rescue access before disabling passwords. Keep private keys outside the server/repository.
- [ ] Disable password-based SSH and direct root SSH only after validating key login and sudo. Validate sshd configuration before reload; keep the current session until an independent new session succeeds.
- [ ] Configure UFW with narrowly reviewed SSH ingress plus 80/443 for Nginx; deny all other public ingress. Preserve provider-console recovery and review IPv6 as well as IPv4. No public app/PostgreSQL/metrics ports.
- [ ] Add Fail2ban or equivalent SSH abuse protection with monitored bans; do not rely on it instead of keys/network policy. Verify log source and trusted proxy behavior.
- [ ] Enable automatic security updates with monitored failures, a reboot/maintenance policy and package rollback. Track supported kernel/OpenSSL/Node/Nginx releases.
- [ ] Review installed services, users, sudoers, file permissions, outbound access needs and provider metadata/API access. Monitor disk/CPU/memory/network capacity.

## Reverse proxy and application runtime

- [ ] Nginx alone listens on public 80/443; redirect HTTP to HTTPS, validate the intended Host, reject unknown vhosts and unexpected forwarded headers. Proxy only to a fixed localhost upstream, never to a user-selected URL.
- [ ] Bind Next.js to 127.0.0.1 (and deliberate loopback IPv6 policy), with a dedicated non-root service identity. Do not run `next dev` or a build tool as the public production server.
- [ ] Set systemd restart/health/resource policies and useful startup limits. Use NoNewPrivileges and minimal filesystem/capability access after compatibility testing; avoid tightening controls blindly so fonts/uploads stop working.
- [ ] Obtain valid certificates through the approved ACME workflow, automate renewal and reload, and alert on failed renewal/expiry. Test a dry renewal. Configure currently supported TLS versions/ciphers according to current authoritative guidance.
- [ ] Retain application CSP/nosniff/framing/referrer/permissions headers. Add reviewed HSTS only after HTTPS is reliable; includeSubDomains/preload requires reviewing all subdomains. Avoid duplicate contradictory headers across app/Nginx.
- [ ] Enforce ingress body/time limits consistent with 64 KiB ordinary JSON (256 KiB for the supported 5000-ID deletion selection) and <=2.1 MB multipart handling; add slow-request/header limits and route-specific client quotas. Review Nginx request buffering/temp storage and timeout behavior.
- [ ] Keep APP_URL/QR_BASE_URL pinned to the approved HTTPS domain; trust forwarded client identifiers only from the exact proxy path and overwrite external spoofed values. Proxy headers must never determine authorization by themselves.
- [ ] Private/no-store for authenticated APIs/pages/errors/downloads. Never cache admin RSC, session-bearing traffic or employee exports at a shared proxy. Check logout/back behavior.
- [ ] Bound app memory/CPU/concurrency and expensive reports; enforce rate controls before DB work and monitor rejection/latency/error metrics.

## Files and secrets

- [ ] Deploy immutable reviewed builds, lockfile-installed dependencies and required fonts only. Build under a separate identity with no production migration credential; never expose source, `.git`, `.env`, logs, backups or diagnostic artifacts as static files.
- [ ] Store secrets in a protected provider/secret-manager or service environment file readable only by the required user (e.g. root-owned restricted file loaded by systemd); never place values in shell arguments, unit command lines, process logs or repo files.
- [ ] Restrict read/write access to the service directory. Separate deploy-user writes from runtime writes; runtime should not edit code, install packages or access SSH/deployment keys.
- [ ] Keep uploaded XLSX processing in memory within budgets, with no archive extraction or user-controlled file paths. If temporary files are later added, use an isolated restricted directory and explicit cleanup/retention.
- [ ] Remove bootstrap credentials after approved creation/reset. Rotate only with explicit approval and verified rollback; AUTH_SECRET rotation affects both admin sessions and attendance receipts.

## Database, logs and recovery

- [ ] If staying on Neon, keep the reviewed pooled least-privilege runtime connection with verified TLS/network policy; direct migrator remains operator-only. If moving PostgreSQL locally, bind to loopback/private network, enforce SCRAM/TLS/pg_hba policy and block public 5432; design backups before migration.
- [ ] Never use PostgreSQL owner/CREATEDB/CREATEROLE/BYPASSRLS in the app service. Prove runtime cannot mutate AuditLog or alter schema. Restrict privileged routines and provider/OS access independently.
- [ ] Collect application security events, transactional audit references, Nginx/sshd/systemd logs and deployment events to a separated central destination. Mask credentials, cookies, passwords, querystrings with tokens and employee data; set access/retention policies.
- [ ] Configure log rotation, bounded journal retention and alerts before logs fill disk. Preserve incident evidence; runtime must not be able to erase its own independent audit destination.
- [ ] Monitor auth failures/throttles, account privilege changes, attendance impersonation anomalies, deletion batches, unexpected DB permissions, certificate failures and backup failures. Correlate events with privacy-reviewed identifiers.
- [ ] Encrypted off-host backups/PITR with separate recovery identity and tested restoration to an isolated host/database. Include schema, grants, configs and independently retained audit evidence. Define RPO/RTO and verify employee/report consistency after restore.
- [ ] Rehearse application/config/DB role cutover and rollback with synthetic staging data. Keep firewall/SSH rollback through provider console. Do not combine an untested hosting move, schema change and identity migration in one release.

## Acceptance and ongoing checks

- [ ] Run the repository security suite plus isolated PostgreSQL concurrency/permissions tests on the future architecture. Validate rate limiter sharing across workers, proxy Origin behavior, production cookies, report jobs and time zone.
- [ ] Verify domain/registrar MFA, stale DNS/takeover risks, DNSSEC/CAA as applicable; backups/log visibility and administrator recovery need separate evidence.
- [ ] Obtain explicit approval for DNS cutover and deployment; verify bounded public denial/headers and approved synthetic end-to-end stories after cutover. Keep incident runbooks and periodic restore/access reviews.

The VPS does not fix email-only attendance, privileged DB access or missing admin step-up by itself. Resolve the OPEN High application findings before approving the migration as secure.
