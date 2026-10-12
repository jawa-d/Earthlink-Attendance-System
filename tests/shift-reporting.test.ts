import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
const m = vi.hoisted(() => ({
  employees: vi.fn(),
  records: vi.fn(),
  count: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    employee: { findMany: m.employees },
    attendanceRecord: { count: m.count, findMany: m.records },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ attendanceRecord: { count: m.count, findMany: m.records } }),
  },
}));
vi.mock("@/lib/auth", () => ({ authorize: m.auth }));
import { getAttendanceList } from "../src/lib/attendance-list";
import {
  buildLeaderReport,
  type ReportEmployee,
} from "../src/lib/leader-report";
import {
  exportLeaderReport,
  leaderDetailHeaders,
} from "../src/lib/leader-report-export";
import { GET as exportAttendance } from "../src/app/api/admin/export/route";
const id = "00000000-0000-4000-8000-000000000001";
const day = new Date("2026-10-12");
const history = {
  shiftId: id,
  shiftCodeSnapshot: "OLD",
  shiftNameSnapshot: "مسائي قديم",
  shiftStartTimeSnapshot: "16:30",
  shiftEndTimeSnapshot: "01:00",
  shiftBusinessDate: day,
};
const employee: ReportEmployee = {
  id: "synthetic",
  employeeNumber: "1",
  fullName: "Synthetic",
  normalizedEmail: "synthetic@earthlink.iq",
  departmentId: "department",
  department: { name: "Synthetic" },
  createdAt: new Date("2026-10-01"),
  deletedAt: null,
  assignments: [
    {
      departmentId: "department",
      departmentName: "Synthetic",
      teamLeaderId: null,
      leaderName: null,
      effectiveFrom: new Date("2026-10-01"),
      effectiveTo: null,
      status: "ACTIVE",
    },
  ],
  attendance: [
    {
      id: "shifted",
      attendanceDate: day,
      checkInAt: new Date("2026-10-12T13:30:00Z"),
      registrationMethod: "QR",
      status: "PRESENT",
      ...history,
    },
    {
      id: "legacy",
      attendanceDate: day,
      checkInAt: new Date("2026-10-12T00:00:00Z"),
      registrationMethod: "QR",
      status: "PRESENT",
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ role: "VIEWER" });
  m.count.mockResolvedValue(2);
  m.records.mockResolvedValue(
    employee.attendance.map((r) => ({ ...r, employee: { ...employee } })),
  );
});
describe("shift-aware raw and daily reporting preserves historical/legacy records", () => {
  it("default list retains legacy records and filters use stable shift ID / null", async () => {
    expect(
      (await getAttendanceList(new URLSearchParams({ date: "2026-10-12" })))
        .rows,
    ).toHaveLength(2);
    await getAttendanceList(
      new URLSearchParams({ date: "2026-10-12", shift: id }),
    );
    expect(m.records.mock.calls[1][0].where.shiftId).toBe(id);
    await getAttendanceList(
      new URLSearchParams({ date: "2026-10-12", shift: "none" }),
    );
    expect(m.records.mock.calls[2][0].where.shiftId).toBeNull();
  });
  it("does not invent unregistered shift attendance without an employee roster", async () => {
    const result = await getAttendanceList(
      new URLSearchParams({
        date: "2026-10-12",
        shift: id,
        status: "UNREGISTERED",
      }),
    );
    expect(result.rows).toEqual([]);
    expect(m.employees).not.toHaveBeenCalled();
  });
  it("daily leader counts still count the employee once and display every historical event's shift", () => {
    const result = buildLeaderReport([employee], [], day, day);
    expect(result.rows).toHaveLength(1);
    expect(result.groups[0].present).toBe(1);
    expect(result.rows[0].eventCount).toBe(2);
    expect(result.rows[0].shiftLabels).toEqual(
      expect.arrayContaining([
        "بدون شفت",
        "OLD — مسائي قديم — 04:30 م إلى 01:00 ص (بداية الشفت 2026-10-12)",
      ]),
    );
    const filtered = buildLeaderReport(
      [employee],
      [],
      day,
      new Date("2026-10-13"),
      { shift: id },
    );
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].eventCount).toBe(1);
    expect(filtered.groups[0].employeeDays).toBe(1);
    expect(
      buildLeaderReport([employee], [], day, day, { shift: "none" }).rows[0]
        .shiftLabels,
    ).toEqual(["بدون شفت"]);
  });
  it("raw Excel and PDF contain historical shift columns while old records remain labelled", async () => {
    const response = await exportAttendance(
      new Request(
        "https://synthetic.invalid/api/admin/export?kind=attendance&date=2026-10-12&format=xlsx",
      ),
    );
    expect(response.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = book.worksheets[0];
    expect(sheet.getRow(2).values).toEqual(
      expect.arrayContaining(["رمز الشفت", "اسم الشفت", "تاريخ بداية الشفت"]),
    );
    expect(sheet.getRow(3).values).toEqual(
      expect.arrayContaining(["OLD", "مسائي قديم", "16:30", "01:00"]),
    );
    expect(sheet.getRow(4).values).toEqual(
      expect.arrayContaining(["بدون شفت"]),
    );
    const pdf = await exportAttendance(
      new Request(
        "https://synthetic.invalid/api/admin/export?kind=attendance&date=2026-10-12&format=pdf",
      ),
    );
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });
  it("grouped exports preserve shift lists without multiplying employee-day totals", async () => {
    const report = buildLeaderReport([employee], [], day, day);
    const bytes = await exportLeaderReport(report, false);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as never);
    const cell = book.worksheets[1]
      .getRow(2)
      .getCell(leaderDetailHeaders.length);
    expect(cell.text).toContain("OLD — مسائي قديم");
    expect(cell.text).toContain("بدون شفت");
    expect(
      (await exportLeaderReport(report, true)).subarray(0, 4).toString(),
    ).toBe("%PDF");
  });
});
