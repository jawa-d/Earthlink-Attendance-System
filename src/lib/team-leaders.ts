import { Prisma, type Employee } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "./http";
import { businessDate, dateValue } from "./validation";
export const leaderSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  employeeNumber: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => v || null),
  departmentId: z.uuid(),
  isActive: z.boolean().default(true),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => v || null),
});
// All assignment-changing admin transactions acquire this lock before employee row locks.
export async function lockAssignments(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73591044)`;
}
export async function validateLeaderAssignment(
  tx: Prisma.TransactionClient,
  departmentId: string,
  status: string,
  leaderId: string | null | undefined,
) {
  const configured = await tx.teamLeader.count({ where: { departmentId } });
  if (status === "ACTIVE" && configured > 0 && !leaderId)
    throw new HttpError(
      400,
      "اختر الليدر المسؤول: تم إعداد الليدرية لهذا القسم",
    );
  if (leaderId) {
    const leader = await tx.teamLeader.findUnique({ where: { id: leaderId } });
    if (!leader?.isActive || leader.departmentId !== departmentId)
      throw new HttpError(400, "الليدر غير فعال أو لا ينتمي إلى القسم المحدد");
  }
}
export function assignmentEffectiveDate(now: Date, initial: boolean) {
  const day = dateValue(businessDate(now));
  return initial ? day : new Date(day.getTime() + 86400000);
}
export async function recordAssignment(
  tx: Prisma.TransactionClient,
  employee: Employee,
  now = new Date(),
  initial = false,
) {
  const effectiveFrom = assignmentEffectiveDate(now, initial);
  const department = await tx.department.findUniqueOrThrow({
    where: { id: employee.departmentId },
  });
  const leader = employee.teamLeaderId
    ? await tx.teamLeader.findUniqueOrThrow({
        where: { id: employee.teamLeaderId },
      })
    : null;
  await tx.employeeAssignment.updateMany({
    where: {
      employeeId: employee.id,
      effectiveTo: null,
      effectiveFrom: { lt: effectiveFrom },
    },
    data: { effectiveTo: effectiveFrom },
  });
  const data = {
    teamLeaderId: employee.teamLeaderId,
    departmentId: employee.departmentId,
    leaderName: leader?.fullName || null,
    departmentName: department.name,
    status: employee.deletedAt ? ("INACTIVE" as const) : employee.status,
    effectiveTo: null,
  };
  await tx.employeeAssignment.upsert({
    where: {
      employeeId_effectiveFrom: { employeeId: employee.id, effectiveFrom },
    },
    create: { employeeId: employee.id, effectiveFrom, ...data },
    update: data,
  });
}
