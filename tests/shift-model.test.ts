import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shiftSchema,
  shiftWindow,
  shiftStatistics,
  shiftsEnabled,
} from "../src/lib/shifts";
import {
  shiftHistoryLabel,
  shiftChoiceLabel,
  time12,
} from "../src/lib/shift-display";
import { businessDate } from "../src/lib/validation";
import { attendanceFilters } from "../src/lib/attendance-list";
const id = "00000000-0000-4000-8000-000000000001";
const valid = {
  code: " s02 ",
  name: "الشفت المسائي",
  startTime: "16:30",
  endTime: "01:00",
  departmentIds: [id, id],
};
afterEach(() => vi.unstubAllEnvs());
describe("shift definitions, time windows and history", () => {
  it("normalizes unique codes and deduplicates department restrictions", () => {
    expect(shiftSchema.parse(valid)).toMatchObject({
      code: "S02",
      departmentIds: [id],
      isActive: true,
    });
  });
  it.each([
    { code: "../unsafe" },
    { startTime: "24:00" },
    { endTime: "1:00" },
    { startTime: "16:30", endTime: "16:30" },
    { departmentIds: ["forged"] },
    { name: "" },
    { endTime: "12:60" },
  ])("rejects invalid shift input %j", (change) =>
    expect(shiftSchema.safeParse({ ...valid, ...change }).success).toBe(false),
  );
  it.each([
    "2026-10-12T13:30:00Z",
    "2026-10-12T21:00:00Z",
    "2026-10-12T21:30:00Z",
  ])("maps overnight check-in %s to a single Oct 12 schedule", (timestamp) => {
    const at = new Date(timestamp);
    const result = shiftWindow(valid, at);
    expect(result).toEqual({
      shiftBusinessDate: new Date("2026-10-12"),
      shiftStartsAt: new Date("2026-10-12T13:30:00Z"),
      shiftEndsAt: new Date("2026-10-12T22:00:00Z"),
    });
    if (timestamp.includes("21:")) expect(businessDate(at)).toBe("2026-10-13");
  });
  it("keeps daytime dates and handles an overnight month/year boundary", () => {
    const day = shiftWindow(
      { startTime: "08:00", endTime: "16:00" },
      new Date("2026-10-12T07:00:00Z"),
    );
    expect(day.shiftStartsAt.toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(day.shiftEndsAt.toISOString()).toBe("2026-10-12T13:00:00.000Z");
    expect(
      shiftWindow(
        valid,
        new Date("2026-12-31T21:30:00Z"),
      ).shiftBusinessDate.toISOString(),
    ).toBe("2026-12-31T00:00:00.000Z");
  });
  it("defaults rollout off; only explicit true enables required selection", () => {
    vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "");
    expect(shiftsEnabled()).toBe(false);
    vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "true");
    expect(shiftsEnabled()).toBe(true);
  });
  it("uses Asia/Baghdad's historical IANA offset rather than a permanent UTC+03 assumption", () => {
    expect(
      shiftWindow(
        { startTime: "08:00", endTime: "16:00" },
        new Date("2007-07-12T06:00:00Z"),
      ).shiftStartsAt.toISOString(),
    ).toBe("2007-07-12T04:00:00.000Z");
  });
  it("renders 12-hour Arabic indicators and historical/legacy labels", () => {
    expect(time12("00:00")).toBe("12:00 ص");
    expect(time12("16:30")).toBe("04:30 م");
    expect(time12("12:00")).toBe("12:00 م");
    expect(shiftChoiceLabel({ ...valid, id, code: "S02" })).toContain(
      "ينتهي في اليوم التالي",
    );
    expect(shiftHistoryLabel({})).toBe("بدون شفت");
    expect(
      shiftHistoryLabel({
        shiftCodeSnapshot: "OLD",
        shiftNameSnapshot: "اسم قديم",
      }),
    ).toBe("OLD — اسم قديم");
  });
  it("combines shift predicates with date, department, employee, status and leader filters", () => {
    const filters = attendanceFilters(
      new URLSearchParams({
        date: "2026-10-12",
        shift: id,
        employee: id,
        teamLeaderId: id,
        department: id,
        status: "PRESENT",
      }),
    );
    expect(filters.where.shiftId).toBe(id);
    expect(filters.where.employee).toMatchObject({ id });
    expect(filters.where.status).toBe("PRESENT");
    expect(filters.where.OR).toHaveLength(1);
    expect(
      attendanceFilters(new URLSearchParams({ shift: "none" })).where.shiftId,
    ).toBeNull();
    expect(() =>
      attendanceFilters(new URLSearchParams({ shift: "S02" })),
    ).toThrow();
  });
  it("counts unique present employees per shift without changing event totals or inferring lateness", () => {
    const common = {
      shiftId: id,
      shiftCodeSnapshot: "S02",
      shiftNameSnapshot: "مسائي",
      employeeId: "synthetic",
      status: "PRESENT",
      checkInAt: new Date(),
    };
    const result = shiftStatistics([
      common,
      { ...common, status: "LATE" },
      { ...common, employeeId: "other", status: "ABSENT", checkInAt: null },
      { employeeId: "legacy", status: "PRESENT", checkInAt: new Date() },
    ]);
    expect(result).toEqual([
      { id, label: "S02 — مسائي", events: 3, registeredEmployees: 1 },
      { id: "none", label: "بدون شفت", events: 1, registeredEmployees: 1 },
    ]);
  });
});
