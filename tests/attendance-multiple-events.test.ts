import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { summarizeAttendanceDay } from "../src/lib/attendance-summary";
import {
  buildLeaderReport,
  type ReportEmployee,
} from "../src/lib/leader-report";
import { exportLeaderReport } from "../src/lib/leader-report-export";
import { spreadsheet } from "../src/lib/export";
const date = new Date("2026-10-11T00:00:00Z");
const first = new Date("2026-10-11T00:00:00Z"),
  last = new Date("2026-10-11T10:00:00Z");
function employee(): ReportEmployee {
  return {
    id: "employee",
    employeeNumber: "1",
    fullName: "موظف تجريبي",
    normalizedEmail: "synthetic@earthlink.iq",
    departmentId: "department",
    department: { name: "مركز الاتصال" },
    createdAt: date,
    deletedAt: null,
    assignments: [
      {
        teamLeaderId: "leader",
        leaderName: "ليدر",
        departmentId: "department",
        departmentName: "مركز الاتصال",
        status: "ACTIVE",
        effectiveFrom: date,
        effectiveTo: null,
      },
    ],
    attendance: [
      {
        id: "first",
        attendanceDate: date,
        status: "PRESENT",
        checkInAt: first,
        registrationMethod: "QR",
      },
      {
        id: "last",
        attendanceDate: date,
        status: "LATE",
        checkInAt: last,
        registrationMethod: "QR",
      },
    ],
  };
}
describe("multiple same-day events and administrative corrections", () => {
  it("counts a person once and preserves earliest/latest events", () => {
    const e = employee();
    expect(summarizeAttendanceDay(e.attendance)).toMatchObject({
      present: true,
      status: "PRESENT",
      eventCount: 2,
      firstCheckInAt: first,
      lastCheckInAt: last,
    });
    const report = buildLeaderReport([e], [], date, date);
    expect(report.groups[0]).toMatchObject({
      totalAssignedActiveEmployees: 1,
      employeeDays: 1,
      present: 1,
      absent: 0,
      percentage: 100,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      eventCount: 2,
      firstCheckInAt: first,
      lastCheckInAt: last,
    });
  });
  it("handles manual ABSENT/EXCUSED events without overwriting a real present event", () => {
    const e = employee();
    e.attendance.push({
      id: "manual",
      attendanceDate: date,
      status: "ABSENT",
      checkInAt: null,
      registrationMethod: "ADMIN",
    });
    expect(buildLeaderReport([e], [], date, date).groups[0].present).toBe(1);
    e.attendance = [
      {
        id: "manual",
        attendanceDate: date,
        status: "EXCUSED",
        checkInAt: null,
        registrationMethod: "ADMIN",
      },
    ];
    expect(buildLeaderReport([e], [], date, date).groups[0]).toMatchObject({
      present: 0,
      absent: 0,
      excused: 1,
    });
  });
  it("exports one employee-day, both timestamps and the event count", async () => {
    const report = buildLeaderReport([employee()], [], date, date);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await exportLeaderReport(report, false)) as never);
    expect(book.worksheets[0].getRow(2).getCell(4).value).toBe(1);
    expect(book.worksheets[1].rowCount).toBe(2);
    expect(book.worksheets[1].getRow(2).getCell(10).value).toBe("03:00:00");
    expect(book.worksheets[1].getRow(2).getCell(11).value).toBe("13:00:00");
    expect(book.worksheets[1].getRow(2).getCell(12).value).toBe("2");
  });
  it("keeps all raw events in Excel while counting distinct employee-days in its summary", async () => {
    const rows = [
      [
        "1",
        "Test",
        "synthetic@earthlink.iq",
        "Department",
        "2026-10-11",
        "03:00:00",
        "حاضر",
        "QR",
      ],
      [
        "1",
        "Test",
        "synthetic@earthlink.iq",
        "Department",
        "2026-10-11",
        "13:00:00",
        "حاضر",
        "QR",
      ],
    ];
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await spreadsheet(rows)) as never);
    expect(book.worksheets[0].rowCount).toBe(3);
    expect(book.worksheets[1].getRow(1).getCell(2).value).toBe(2);
    expect(book.worksheets[1].getRow(2).getCell(2).value).toBe(1);
    expect(book.worksheets[1].getRow(4).getCell(2).value).toBe(1);
  });
});
