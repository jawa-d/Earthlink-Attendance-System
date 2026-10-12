import { Prisma } from "@prisma/client";
import { db } from "./db";
import { businessDate, corporateEmail } from "./validation";
import { HttpError } from "./http";
import { AttendanceCooldownError, cooldownTimes } from "./attendance-cooldown";
import { lastSuccessfulAttendance } from "./attendance-last-success";
import { attendanceShift } from "./shifts";
import { shiftHistoryLabel } from "./shift-display";
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
export async function registerAttendance(input: unknown, testNow?: Date, shiftId?: unknown) {
  const email = corporateEmail.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE "normalizedEmail"=${email} FOR UPDATE`;
    const employee = await tx.employee.findUnique({
      where: { normalizedEmail: email },
    });
    if (!employee || employee.status !== "ACTIVE" || employee.deletedAt)
      throw new HttpError(
        403,
        "تعذر تسجيل الحضور. يرجى التواصل مع مسؤول القسم.",
      );
    const last = await lastSuccessfulAttendance(tx, employee);
    // Sample server time after acquiring the employee lock, including queued requests.
    const now = testNow || new Date();
    const day = new Date(`${businessDate(now)}T00:00:00Z`);
    if (last) {
      const times = cooldownTimes(last, now);
      if (now.getTime() < Date.parse(times.nextAllowedAt))
        throw new AttendanceCooldownError(employee.id, times);
    }
    const shift = await attendanceShift(tx, shiftId, employee.departmentId, now);
    const record = await tx.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        attendanceDate: day,
        checkInAt: now,
        originalCheckInAt: now,
        registeredAt: now,
        status: "PRESENT",
        registrationMethod: "QR",
        ...shift,
      },
    });
    await tx.employee.update({
      where: { id: employee.id },
      data: { lastSuccessfulAttendanceAt: now },
    });
    return {
      employeeId: employee.id,
      name: employee.fullName,
      email: employee.normalizedEmail,
      date: businessDate(now),
      checkInAt: record.checkInAt,
      shiftLabel: shiftHistoryLabel(shift),
      ...cooldownTimes(now, now),
    };
  });
}
