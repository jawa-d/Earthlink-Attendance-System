import { Prisma } from "@prisma/client";
import { db } from "./db";
import { businessDate, corporateEmail } from "./validation";
import { HttpError } from "./http";
export async function audit(
  tx: Prisma.TransactionClient,
  actorAdminId: string,
  action: string,
  entityType: string,
  entityId: string,
  oldValues: unknown,
  newValues: unknown,
  reason: string,
) {
  const json = (v: unknown) =>
    v == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(v));
  await tx.auditLog.create({
    data: {
      actorAdminId,
      action,
      entityType,
      entityId,
      oldValues: json(oldValues),
      newValues: json(newValues),
      reason,
    },
  });
}
export async function registerAttendance(input: unknown, now = new Date()) {
  const email = corporateEmail.parse(input);
  const day = new Date(`${businessDate(now)}T00:00:00Z`);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE "normalizedEmail"=${email} FOR UPDATE`;
      const employee = await tx.employee.findUnique({
        where: { normalizedEmail: email },
      });
      if (!employee || employee.status !== "ACTIVE" || employee.deletedAt)
        throw new HttpError(
          403,
          "تعذر تسجيل الحضور. يرجى التواصل مع مسؤول القسم.",
        );
      const prior = await tx.attendanceRecord.findFirst({
        where: {
          employeeId: employee.id,
          attendanceDate: day,
          deletedAt: null,
        },
      });
      if (prior) throw new HttpError(409, "تم تسجيل حضورك مسبقاً لهذا اليوم");
      const record = await tx.attendanceRecord.create({
        data: {
          employeeId: employee.id,
          attendanceDate: day,
          checkInAt: now,
          originalCheckInAt: now,
          status: "PRESENT",
          registrationMethod: "QR",
        },
      });
      return {
        name: employee.fullName,
        email: employee.normalizedEmail,
        date: businessDate(now),
        checkInAt: record.checkInAt,
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new HttpError(409, "تم تسجيل حضورك مسبقاً لهذا اليوم");
    throw e;
  }
}
