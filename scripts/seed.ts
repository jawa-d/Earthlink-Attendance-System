import "dotenv/config";
import { reportOperatorFailure } from "./operator-error";
import { db } from "../src/lib/db";
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed prohibited in production");
  const department = await db.department.upsert({
    where: { name: "قسم تجريبي" },
    create: { name: "قسم تجريبي" },
    update: {},
  });
  for (let i = 1; i <= 12; i++)
    await db.employee.upsert({
      where: { employeeNumber: `DEMO-${i}` },
      update: {},
      create: {
        employeeNumber: `DEMO-${i}`,
        fullName: `موظف تجريبي ${i}`,
        normalizedEmail: `demo${i}@earthlink.iq`,
        departmentId: department.id,
      },
    });
  console.log(
    "Fictional development employees created; no administrator credentials seeded.",
  );
}
main()
  .catch(reportOperatorFailure)
  .finally(() => db.$disconnect());
