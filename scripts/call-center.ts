import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { CALL_CENTER, resolveCallCenter } from "../src/lib/departments";
config({ quiet: true });
const db = new PrismaClient({ log: [] });
type Existing = {
  id: string;
  name: string;
  englishName: string | null;
  code: string | null;
  isActive: boolean;
};
async function inspect(tx: Pick<PrismaClient, "$queryRaw">) {
  // JSON lookup permits a read-only preview before the additive migration exists.
  return tx.$queryRaw<Existing[]>`SELECT id, name, "isActive",
    to_jsonb(d)->>'englishName' AS "englishName", to_jsonb(d)->>'code' AS code
    FROM "Department" d`;
}
async function main() {
  if (!process.argv.includes("--apply")) {
    const existing = resolveCallCenter(await inspect(db));
    console.log(
      existing
        ? "Preview: reuse existing department and preserve its ID and employee links."
        : "Preview: create one active Call Center department.",
    );
    console.log(
      "Target: مركز الاتصال / Call Center / CALL_CENTER / Active. No records changed.",
    );
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73591043)`;
    const existing = resolveCallCenter(await inspect(tx));
    if (
      existing &&
      Object.entries(CALL_CENTER).every(
        ([key, value]) => existing[key as keyof Existing] === value,
      )
    ) {
      console.log("Call Center already configured; no changes needed.");
      return;
    }
    const row = existing
      ? await tx.department.update({
          where: { id: existing.id },
          data: CALL_CENTER,
        })
      : await tx.department.create({ data: CALL_CENTER });
    await tx.auditLog.create({
      data: {
        action: existing ? "UPDATE" : "CREATE",
        entityType: "Department",
        entityId: row.id,
        oldValues: existing ?? undefined,
        newValues: CALL_CENTER,
        reason: "Approved operator CLI: configure Call Center department",
      },
    });
    console.log(
      "Call Center configured; department and audit entry committed together.",
    );
  });
}
main()
  .catch(() => {
    console.error(
      "Call Center operation stopped. Check migration status or conflicting department names/codes; private database details suppressed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
