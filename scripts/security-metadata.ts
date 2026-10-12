// Read-only catalog inspection. Never prints connection strings or table rows.
import fs from "node:fs";
import { config, parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (!fs.existsSync(file)) continue;
  const values = parse(fs.readFileSync(file));
  console.log(JSON.stringify({ file, keys: Object.keys(values), connections:
    ["DATABASE_URL", "DIRECT_URL", "TEST_DATABASE_URL"].filter(key => values[key]).map(key => {
      try {
        const url = new URL(values[key]);
        return { key, neon: url.hostname.endsWith(".neon.tech"), pooled: url.hostname.includes("-pooler."), tls: url.searchParams.get("sslmode"), hasPassword: !!url.password };
      } catch { return { key, valid: false }; }
    }) }));
}
config({ quiet: true });
config({ path: ".env.local", quiet: true });
async function inspect() {
if (process.argv.includes("--database")) {
  const db = new PrismaClient({ log: [] });
  try {
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
      const roles = await tx.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user`;
      const rights = await tx.$queryRaw`SELECT c.relname AS table_name,
        pg_has_role(current_user, c.relowner, 'USAGE') AS inherits_owner,
        has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
        has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
        has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
        has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete,
        has_table_privilege(current_user, c.oid, 'TRUNCATE') AS can_truncate,
        has_table_privilege(current_user, c.oid, 'TRIGGER') AS can_trigger
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('AuditLog', 'AdminUser', 'Employee', 'AttendanceRecord', '_prisma_migrations') ORDER BY c.relname`;
      const schema = await tx.$queryRaw`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects`;
      const tls = await tx.$queryRaw`SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
      return { roles, rights, schema, tls };
    }, { timeout: 15000 });
    console.log(JSON.stringify({ databaseMetadata: result }, null, 2));
  } catch {
    console.error("Read-only database metadata unavailable; private diagnostics suppressed.");
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
}
void inspect();
