import type { Prisma } from "@prisma/client";
// Cover older instances still writing QR events during a migration/deployment overlap.
// The durable Employee timestamp also survives record deletion, moves and corrections.
export async function lastSuccessfulAttendance(
  db: Pick<Prisma.TransactionClient, "attendanceRecord">,
  employee: { id: string; lastSuccessfulAttendanceAt?: Date | null },
) {
  const legacy = await db.attendanceRecord.findFirst({
    where: {
      employeeId: employee.id,
      registrationMethod: "QR",
      registeredAt: null,
      ...(employee.lastSuccessfulAttendanceAt
        ? { createdAt: { gt: employee.lastSuccessfulAttendanceAt } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { originalCheckInAt: true, createdAt: true },
  });
  const old = legacy ? legacy.originalCheckInAt || legacy.createdAt : null;
  const stored = employee.lastSuccessfulAttendanceAt;
  return old && (!stored || old > stored) ? old : stored || null;
}
