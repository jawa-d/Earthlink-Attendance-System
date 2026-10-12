import "dotenv/config";
import { reportOperatorFailure } from "./operator-error";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "../src/lib/db";
import { audit } from "../src/lib/service";
async function main() {
  const email = z
    .email()
    .toLowerCase()
    .parse(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = z
    .string()
    .min(14)
    .max(256)
    .parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const passwordHash = await hash(password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73591042)`;
    if (process.argv[2] === "reset") {
      await tx.adminUser.findUniqueOrThrow({ where: { email } });
      const row = await tx.adminUser.update({
        where: { email },
        data: { passwordHash },
      });
      await tx.session.deleteMany({ where: { adminId: row.id } });
      await audit(
        tx,
        row.id,
        "PASSWORD_RESET",
        "AdminUser",
        row.id,
        null,
        null,
        "Protected operator CLI password reset",
      );
    } else {
      if (await tx.adminUser.count())
        throw new Error(
          "Bootstrap only works before the first administrator exists",
        );
      const row = await tx.adminUser.create({
        data: {
          name: z.string().min(2).parse(process.env.BOOTSTRAP_ADMIN_NAME),
          email,
          passwordHash,
          role: "SUPER_ADMIN",
        },
      });
      await audit(
        tx,
        row.id,
        "BOOTSTRAP",
        "AdminUser",
        row.id,
        null,
        { email, role: row.role },
        "Protected operator CLI bootstrap",
      );
    }
  });
  console.log(
    "Administrator operation completed. Remove bootstrap password from environment.",
  );
}
main()
  .catch(reportOperatorFailure)
  .finally(() => db.$disconnect());
