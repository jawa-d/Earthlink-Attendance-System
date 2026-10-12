import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { businessDate, dateValue } from "./validation";
import { HttpError } from "./http";
import type { ShiftChoice, ShiftHistory } from "./shift-display";
import { shiftHistoryLabel } from "./shift-display";

export function shiftsEnabled() {
  return process.env.ATTENDANCE_SHIFTS_ENABLED === "true";
}
export const shiftTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "وقت غير صالح؛ استخدم HH:mm");
export const shiftSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "رمز الشفت غير صالح"),
    name: z.string().trim().min(2).max(120),
    startTime: shiftTime,
    endTime: shiftTime,
    isActive: z.boolean().default(true),
    departmentIds: z
      .array(z.uuid())
      .max(100)
      .default([])
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((s) => s.startTime !== s.endTime, {
    message: "وقت البداية والنهاية يجب أن يختلفا",
    path: ["endTime"],
  });

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Baghdad",
  timeZoneName: "longOffset",
});
function baghdadInstant(day: string, time: string) {
  const wall = Date.parse(`${day}T${time}:00Z`);
  let instant = wall;
  // Resolve the IANA offset at the actual instant, including historical DST.
  for (let i = 0; i < 3; i++) {
    const zone = offsetFormat
      .formatToParts(new Date(instant))
      .find((p) => p.type === "timeZoneName")!.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(zone);
    const offset = match
      ? (match[1] === "+" ? 1 : -1) *
        (Number(match[2]) * 3600 +
          Number(match[3]) * 60 +
          Number(match[4] || 0)) *
        1000
      : 0;
    instant = wall - offset;
  }
  return new Date(instant);
}
// Schedule date stays separate from the existing check-in calendar date.
// No lateness/eligibility rules: outside the interval selection is allowed.
export function shiftWindow(
  shift: Pick<ShiftChoice, "startTime" | "endTime">,
  at: Date,
) {
  const today = businessDate(at);
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const overnight = shift.endTime < shift.startTime;
  const anchor = dateValue(today);
  if (overnight && localTime < shift.endTime)
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  const day = anchor.toISOString().slice(0, 10);
  const start = baghdadInstant(day, shift.startTime);
  const endDay = new Date(anchor);
  if (overnight) endDay.setUTCDate(endDay.getUTCDate() + 1);
  const end = baghdadInstant(endDay.toISOString().slice(0, 10), shift.endTime);
  return { shiftBusinessDate: anchor, shiftStartsAt: start, shiftEndsAt: end };
}
export async function attendanceShift(
  tx: Prisma.TransactionClient,
  shiftId: unknown,
  departmentId: string,
  at: Date,
  required = shiftsEnabled(),
) {
  if (shiftId == null || shiftId === "") {
    if (required)
      throw new HttpError(400, "اختر شفتاً صالحاً قبل تسجيل الحضور");
    return {};
  }
  const id = z.uuid().parse(shiftId);
  // Lock a definition while verifying restrictions/snapshotting. Shift writers
  // take FOR UPDATE on this same row, then replace restrictions atomically.
  await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${id}::uuid FOR SHARE`;
  const shift = await tx.shift.findUnique({
    where: { id },
    include: { departments: { select: { departmentId: true } } },
  });
  if (
    !shift ||
    !shift.isActive ||
    (shift.departments.length &&
      !shift.departments.some((d) => d.departmentId === departmentId))
  )
    throw new HttpError(400, "الشفت غير متاح لهذا الموظف. أعد تحميل الخيارات");
  return {
    shiftId: shift.id,
    shiftCodeSnapshot: shift.code,
    shiftNameSnapshot: shift.name,
    shiftStartTimeSnapshot: shift.startTime,
    shiftEndTimeSnapshot: shift.endTime,
    ...shiftWindow(shift, at),
  };
}
export function shiftFilter(value: string | null) {
  return value
    ? value === "none"
      ? "none"
      : z.uuid().parse(value)
    : undefined;
}
export function matchesShift(row: ShiftHistory, filter?: string) {
  return !filter || (filter === "none" ? !row.shiftId : row.shiftId === filter);
}
export function shiftStatistics(
  rows: (ShiftHistory & {
    employeeId: string;
    status: string;
    checkInAt: Date | null;
  })[],
) {
  const groups = new Map<
    string,
    { id: string; label: string; events: number; employees: Set<string> }
  >();
  for (const row of rows) {
    const label = shiftHistoryLabel(row);
    const key = `${row.shiftId || "none"}:${label}`;
    const g = groups.get(key) || {
      id: row.shiftId || "none",
      label,
      events: 0,
      employees: new Set<string>(),
    };
    g.events++;
    if (["PRESENT", "LATE"].includes(row.status) && row.checkInAt)
      g.employees.add(row.employeeId);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    id: g.id,
    label: g.label,
    events: g.events,
    registeredEmployees: g.employees.size,
  }));
}
