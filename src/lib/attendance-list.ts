import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { businessDate, dateValue, pageNumber } from "./validation";
import { HttpError } from "./http";
import { shiftFilter } from "./shifts";

// Assignment intervals are [effectiveFrom, effectiveTo). Unknown history is
// never attributed to the employee's current leader.
export function attendanceFilters(p: URLSearchParams) {
  const start = dateValue(p.get("start") || p.get("date") || businessDate());
  const end = dateValue(p.get("end") || p.get("date") || businessDate());
  if (end < start || end.getTime() - start.getTime() > 366 * 86400000)
    throw new HttpError(400, "اختر فترة لا تتجاوز سنة");
  const leader = p.get("teamLeaderId") || p.get("teamLeader") || undefined;
  if (leader && leader !== "unassigned") z.uuid().parse(leader);
  const departmentId = p.get("department") ? z.uuid().parse(p.get("department")) : undefined;
  const q = (p.get("q") || "").slice(0, 120);
  const employee: Prisma.EmployeeWhereInput = {
    ...(p.get("employee") ? { id: z.uuid().parse(p.get("employee")) } : {}),
    ...(q ? { OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      { normalizedEmail: { contains: q, mode: "insensitive" } },
      { employeeNumber: { contains: q } },
    ] } : {}),
  };
  const status = p.get("status") ? z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNREGISTERED"]).parse(p.get("status")) : undefined;
  const shift = shiftFilter(p.get("shift"));
  const days: Date[] = [];
  for (let day = start; day <= end; day = new Date(day.getTime() + 86400000)) days.push(day);
  const assignment = (day: Date): Prisma.EmployeeAssignmentWhereInput => ({
    effectiveFrom: { lte: day },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: day } }],
    ...(leader ? { teamLeaderId: leader === "unassigned" ? null : leader } : {}),
    ...(departmentId ? { departmentId } : {}),
  });
  const where: Prisma.AttendanceRecordWhereInput = {
    ...(shift ? { shiftId: shift === "none" ? null : shift } : {}),
    attendanceDate: { gte: start, lte: end },
    ...(p.get("deleted") === "true" ? {} : { deletedAt: null }),
    ...(status && status !== "UNREGISTERED" ? { status } : {}),
    employee,
    ...((leader || departmentId) ? { OR: days.map(day => ({
      attendanceDate: day,
      employee: { assignments: { some: assignment(day) } },
    })) } : {}),
  };
  return { where, employee, assignment, days, status, leader, departmentId, shift };
}

export async function getAttendanceList(p: URLSearchParams, exportAll = false) {
  const f = attendanceFilters(p);
  const page = pageNumber(p);
  const include = { employee: { include: { department: true, assignments: { orderBy: { effectiveFrom: "desc" as const } } } } };
  const annotate = (row: Prisma.AttendanceRecordGetPayload<{ include: typeof include }>) => {
    const { assignments, ...employee } = row.employee;
    const a = assignments.find(a => a.effectiveFrom <= row.attendanceDate && (!a.effectiveTo || a.effectiveTo > row.attendanceDate));
    return { ...row, employee: { ...employee, department: a ? { name: a.departmentName } : employee.department }, teamLeaderName: a ? a.leaderName || "بدون ليدر" : "غير معروف تاريخياً", historyUnknown: !a };
  };
  if (f.status === "UNREGISTERED") {
    // No employee-to-shift roster exists. Never invent missing attendance.
    if (f.shift && f.shift !== "none") return { rows: [], total: 0, page };
    const rows = [];
    for (const day of f.days) {
      const employees = await db.employee.findMany({
        where: { AND: [f.employee, {
          assignments: { some: { ...f.assignment(day), status: "ACTIVE" } },
          attendance: { none: { attendanceDate: day, ...(p.get("deleted") === "true" ? {} : { deletedAt: null }) } },
        }] },
        include: { department: true, assignments: { where: f.assignment(day) } },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
      });
      for (const e of employees) {
        const a = e.assignments[0];
        rows.push({ id: `${e.id}-${day.toISOString()}`, employee: { ...e, department: { name: a.departmentName } }, attendanceDate: day, status: "UNREGISTERED", checkInAt: null, registrationMethod: null, teamLeaderName: a.leaderName || "بدون ليدر", historyUnknown: false,
          shiftId: null, shiftCodeSnapshot: null, shiftNameSnapshot: null, shiftStartTimeSnapshot: null, shiftEndTimeSnapshot: null, shiftBusinessDate: null, shiftStartsAt: null, shiftEndsAt: null });
      }
    }
    return { rows: exportAll ? rows : rows.slice((page - 1) * 25, page * 25), total: rows.length, page };
  }
  // The same predicate and snapshot drive both count and pagination.
  return db.$transaction(async tx => {
    const total = await tx.attendanceRecord.count({ where: f.where });
    const rows = await tx.attendanceRecord.findMany({ where: f.where, include,
      orderBy: [{ employee: { fullName: "asc" } }, { attendanceDate: "desc" }, { id: "asc" }],
      ...(exportAll ? {} : { skip: (page - 1) * 25, take: 25 }),
    });
    return { rows: rows.map(annotate), total, page };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
