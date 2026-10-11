# Connect the existing Neon project

Use the existing **Earthlink Attendance System** project and **production** branch. No additional project is needed.

1. Click **Connect** in Neon. Select `production`, the intended database and PostgreSQL role. The database name is the selection shown in Neon; the PostgreSQL engine name does not necessarily mean the database is named `PostgreSQL`.
2. With pooling enabled, copy only the PostgreSQL URL into `DATABASE_URL` in ignored `.env`. The hostname includes `-pooler`. Preserve TLS parameters and append `&connection_limit=5` when a query string is already present.
3. Turn pooling off and copy the PostgreSQL URL into `DIRECT_URL` in the same file. Use the same branch, database and role. Preserve TLS parameters. Copy the URL rather than a `psql` shell command.
4. Keep the generated AUTH_SECRET private. APP_URL is `http://localhost:3000` for local use. Set a stable HTTPS QR_BASE_URL when a production hostname has been chosen. Never paste passwords or connection strings into chat, source files, commands, screenshots or issue descriptions.
5. Run `npm.cmd run db:check` for read-only pooled/direct connection checks. It reports table availability without displaying connection URLs. No migrations or data writes happen in this check.

The existing migrations are `202610110001_initial` (eight application tables, enums, foreign keys and indexes) and `202610110002_active_daily` (partial daily attendance uniqueness and normalized corporate-email check). Review current database state before applying them. For an empty database, apply them with `npm.cmd run db:migrate` and verify with `npm.cmd run db:check -- --require-schema`. Never use migrate reset or db push. Existing conflicting tables or migration failures must be investigated before continuing; do not reset or baseline blindly.

The first administrator is created with `npm.cmd run admin:bootstrap`, using BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME and a 14+ character password. Enter the password through `Read-Host -AsSecureString` in a trusted local terminal and pass it as a temporary environment variable; clear it immediately after the bootstrap exits. Do not persist it in Git, package scripts, CLI arguments or logs. Bootstrap refuses to overwrite any existing administrator.

Disable `LOCAL_ADMIN_PREVIEW` in `.env.local` once the administrator has been created to verify real sign-in. Preview mode has no database access or administrative privileges.

Production variables for Vercel: pooled DATABASE_URL, direct DIRECT_URL, independently generated AUTH_SECRET, exact HTTPS APP_URL and stable HTTPS QR_BASE_URL. Do not set bootstrap passwords, TEST_DATABASE_URL or LOCAL_ADMIN_PREVIEW in production. Use production database credentials only in the production deployment environment; test concurrency and cleanup on an isolated branch/database. Run migrations from a trusted operator terminal or dedicated migration job, separately from builds. No GitHub push or Vercel deployment is authorized yet.

Connection status at preparation: no credentials supplied, no live connection attempted, no migration or bootstrap executed. Update this record with actual verification results after local credentials are configured.
