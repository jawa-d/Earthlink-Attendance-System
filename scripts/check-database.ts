import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
config({ quiet: true });

const requiredTables = [
  "AdminUser",
  "Session",
  "Department",
  "Employee",
  "AttendanceRecord",
  "AuditLog",
  "SystemSetting",
  "RateLimit",
  "TeamLeader",
  "EmployeeAssignment",
];
function connection(key: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[key];
  if (!value || /USER:PASSWORD|HOST|replace-with/.test(value))
    throw new Error(
      `${key} is missing or still a placeholder. No connection attempted.`,
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} is not a valid URL. No connection attempted.`);
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    !url.username ||
    !url.password ||
    url.pathname === "/"
  )
    throw new Error(
      `${key} must be a complete Neon PostgreSQL connection string. No connection attempted.`,
    );
  if (
    !["require", "verify-full", "verify-ca"].includes(
      url.searchParams.get("sslmode") || "",
    )
  )
    throw new Error(`${key} must require TLS. No connection attempted.`);
  if (key === "DATABASE_URL" && !url.hostname.includes("-pooler."))
    throw new Error(
      "DATABASE_URL must use the pooled Neon connection. No connection attempted.",
    );
  if (key === "DIRECT_URL" && url.hostname.includes("-pooler."))
    throw new Error(
      "DIRECT_URL must use the unpooled Neon connection. No connection attempted.",
    );
  return { value, url };
}
async function main() {
  const pooled = connection("DATABASE_URL");
  const direct = connection("DIRECT_URL");
  if (
    pooled.url.hostname.replace("-pooler.", ".") !== direct.url.hostname ||
    pooled.url.pathname !== direct.url.pathname ||
    pooled.url.username !== direct.url.username
  )
    throw new Error(
      "The two URLs must select the same Neon endpoint, database and role. No connection attempted.",
    );
  for (const [label, value] of [
    ["Pooled", pooled.value],
    ["Direct", direct.value],
  ]) {
    const client = new PrismaClient({ datasourceUrl: value, log: [] });
    try {
      await client.$queryRaw`SELECT 1`;
      console.log(`${label} connection: successful (read-only check).`);
      if (label === "Direct") {
        const tables = await client.$queryRaw<
          { table_name: string }[]
        >`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
        const present = new Set(tables.map((t) => t.table_name));
        const missing = requiredTables.filter((t) => !present.has(t));
        console.log(
          `Required application tables present: ${requiredTables.length - missing.length}/${requiredTables.length}.`,
        );
        if (missing.length)
          console.log(`Tables pending migrations: ${missing.join(", ")}.`);
        else {
          const indexes = await client.$queryRaw<
            { indexdef: string }[]
          >`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='AttendanceRecord_active_employee_date'`;
          const activeIndex =
            indexes.length === 1 &&
            indexes[0].indexdef.includes("UNIQUE") &&
            indexes[0].indexdef.includes("deletedAt");
          console.log(
            `Active daily attendance unique index: ${activeIndex ? "present" : "missing"}.`,
          );
          if (process.argv.includes("--require-schema") && !activeIndex)
            process.exitCode = 1;
          const count = await client.adminUser.count();
          console.log(`Existing administrators: ${count}.`);
        }
        if (process.argv.includes("--require-schema") && missing.length)
          process.exitCode = 1;
      }
    } catch {
      // Prisma exception messages can embed connection URLs. Do not log them.
      throw new Error(
        `${label} database verification failed. Check credentials, network access and schema; connection details are suppressed.`,
      );
    } finally {
      await client.$disconnect();
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
