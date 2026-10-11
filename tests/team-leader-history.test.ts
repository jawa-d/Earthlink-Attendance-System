import { describe, it, expect, vi } from "vitest";
import type { Employee, Prisma } from "@prisma/client";
import {
  assignmentEffectiveDate,
  recordAssignment,
  validateLeaderAssignment,
} from "../src/lib/team-leaders";
import {
  assignmentOnDate,
  buildLeaderReport,
  type ReportEmployee,
} from "../src/lib/leader-report";
import { exportLeaderReport } from "../src/lib/leader-report-export";
import ExcelJS from "exceljs";
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const dept = "38f20893-7242-4f23-a144-5026dc22e112";
function employee(): ReportEmployee {
  return {
    id: "employee",
    employeeNumber: "1",
    fullName: "موظف تجريبي",
    normalizedEmail: "synthetic@earthlink.iq",
    departmentId: dept,
    department: { name: "مركز الاتصال" },
    createdAt: day("2026-10-01"),
    deletedAt: null,
    assignments: [
      {
        teamLeaderId: "A",
        leaderName: "ليدر سابق",
        departmentId: dept,
        departmentName: "مركز الاتصال",
        status: "ACTIVE",
        effectiveFrom: day("2026-10-10"),
        effectiveTo: day("2026-10-12"),
      },
      {
        teamLeaderId: "B",
        leaderName: "ليدر جديد",
        departmentId: dept,
        departmentName: "مركز الاتصال",
        status: "ACTIVE",
        effectiveFrom: day("2026-10-12"),
        effectiveTo: null,
      },
    ],
    attendance: [
      {
        id: "record",
        attendanceDate: day("2026-10-11"),
        status: "PRESENT",
        checkInAt: new Date("2026-10-11T06:00:00Z"),
        registrationMethod: "QR",
      },
    ],
  };
}
describe("leader assignment validation and date history", () => {
  it("allows legacy unassigned employees only until leaders are configured", async () => {
    const tx = {
      teamLeader: { count: vi.fn().mockResolvedValue(0), findUnique: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    await expect(
      validateLeaderAssignment(tx, dept, "ACTIVE", null),
    ).resolves.toBeUndefined();
    vi.mocked(tx.teamLeader.count).mockResolvedValue(1);
    await expect(
      validateLeaderAssignment(tx, dept, "ACTIVE", null),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      validateLeaderAssignment(tx, dept, "INACTIVE", null),
    ).resolves.toBeUndefined();
  });
  it.each([
    { isActive: false, departmentId: dept },
    { isActive: true, departmentId: "other" },
    null,
  ])(
    "rejects inactive, missing or cross-department assignments",
    async (leader) => {
      const tx = {
        teamLeader: {
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi.fn().mockResolvedValue(leader),
        },
      } as unknown as Prisma.TransactionClient;
      await expect(
        validateLeaderAssignment(tx, dept, "ACTIVE", "leader"),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it("uses Baghdad dates and next-day boundaries for changes", () => {
    const instant = new Date("2026-10-11T21:01:00Z");
    expect(
      assignmentEffectiveDate(instant, true).toISOString().slice(0, 10),
    ).toBe("2026-10-12");
    expect(
      assignmentEffectiveDate(instant, false).toISOString().slice(0, 10),
    ).toBe("2026-10-13");
    expect(
      assignmentOnDate(employee().assignments, day("2026-10-11"))?.teamLeaderId,
    ).toBe("A");
    expect(
      assignmentOnDate(employee().assignments, day("2026-10-12"))?.teamLeaderId,
    ).toBe("B");
  });
  it("closes the old interval and upserts same-day future changes without rewriting past snapshots", async () => {
    const close = vi.fn();
    const upsert = vi.fn();
    const tx = {
      department: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ name: "مركز الاتصال" }),
      },
      teamLeader: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ fullName: "ليدر جديد" }),
      },
      employeeAssignment: { updateMany: close, upsert },
    } as unknown as Prisma.TransactionClient;
    const row = {
      id: "employee",
      departmentId: dept,
      teamLeaderId: "B",
      status: "ACTIVE",
      deletedAt: null,
    } as Employee;
    await recordAssignment(tx, row, new Date("2026-10-11T08:00:00Z"));
    expect(close.mock.calls[0][0]).toMatchObject({
      where: { effectiveFrom: { lt: day("2026-10-12") } },
      data: { effectiveTo: day("2026-10-12") },
    });
    expect(
      upsert.mock.calls[0][0].where.employeeId_effectiveFrom.effectiveFrom,
    ).toEqual(day("2026-10-12"));
    expect(upsert.mock.calls[0][0].create.leaderName).toBe("ليدر جديد");
  });
});
describe("historical leader attendance reports", () => {
  it("keeps yesterday with the former leader and new-day absence with the new leader", () => {
    const result = buildLeaderReport(
      [employee()],
      [],
      day("2026-10-11"),
      day("2026-10-12"),
    );
    expect(result.groups.find((g) => g.id === "A")).toMatchObject({
      present: 1,
      absent: 0,
      percentage: 100,
      employeeDays: 1,
    });
    expect(result.groups.find((g) => g.id === "B")).toMatchObject({
      present: 0,
      absent: 1,
      percentage: 0,
      employeeDays: 1,
    });
    expect(
      result.rows.find(
        (r) => r.attendanceDate.toISOString().slice(0, 10) === "2026-10-11",
      )?.teamLeaderId,
    ).toBe("A");
    expect(
      result.rows.find(
        (r) => r.attendanceDate.toISOString().slice(0, 10) === "2026-10-12",
      )?.teamLeaderId,
    ).toBe("B");
  });
  it("uses historical department and leader filters rather than current employee relations", () => {
    const e = employee();
    e.departmentId = "new-dept";
    const result = buildLeaderReport(
      [e],
      [],
      day("2026-10-11"),
      day("2026-10-12"),
      { department: dept, teamLeader: "A" },
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].teamLeaderName).toBe("ليدر سابق");
  });
  it("excludes not-yet-employed and inactive periods, and treats EXCUSED separately", () => {
    const e = employee();
    e.createdAt = new Date("2026-10-11T08:00:00Z");
    e.assignments[1].status = "INACTIVE";
    e.attendance[0].status = "EXCUSED";
    const result = buildLeaderReport(
      [e],
      [],
      day("2026-10-10"),
      day("2026-10-12"),
    );
    expect(result.rows.length).toBe(1);
    expect(result.groups.find((g) => g.id === "A")).toMatchObject({
      employeeDays: 1,
      absent: 0,
      present: 0,
      excused: 1,
    });
  });
  it("does not invent pre-baseline absence, but retains actual recorded attendance", () => {
    const e = employee();
    e.assignments = [];
    const result = buildLeaderReport(
      [e],
      [],
      day("2026-10-11"),
      day("2026-10-12"),
    );
    expect(result.historyIncomplete).toBe(true);
    expect(result.groups[0]).toMatchObject({
      employeeDays: 0,
      absent: 0,
      unknownEmployeeDays: 2,
    });
    expect(result.rows.some((r) => r.status === "PRESENT")).toBe(true);
  });
  it("keeps the full denominator when filtering detail status", () => {
    const e = employee();
    e.assignments[0].effectiveTo = null;
    e.assignments = [e.assignments[0]];
    const result = buildLeaderReport(
      [e],
      [],
      day("2026-10-11"),
      day("2026-10-12"),
      { status: "PRESENT" },
    );
    expect(result.rows.length).toBe(1);
    expect(result.groups[0]).toMatchObject({
      employeeDays: 2,
      present: 1,
      absent: 1,
      percentage: 50,
    });
  });
  it("exports grouped summary, date-based details and coverage notes to Excel and PDF", async () => {
    const report = buildLeaderReport(
      [employee()],
      [],
      day("2026-10-11"),
      day("2026-10-12"),
    );
    const buffer = await exportLeaderReport(report, false);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as never);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      "ملخص الليدرية",
      "تفاصيل الحضور",
      "ملاحظات",
    ]);
    expect(book.worksheets[0].rowCount).toBe(3);
    expect(book.worksheets[1].rowCount).toBe(3);
    const pdf = await exportLeaderReport(report, true);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
