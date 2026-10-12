import ExcelJS from "exceljs";
import { pdfReport } from "./export";
import { statusNames } from "./export-labels";
import type { LeaderGroup, LeaderReportRow } from "./leader-report";
import { NO_SHIFT } from "./shift-display";
export const leaderDetailHeaders = [
  "الليدر",
  "القسم",
  "الرقم الوظيفي",
  "الموظف",
  "البريد",
  "التاريخ",
  "الحالة",
  "الوقت",
  "التغطية التاريخية",
  "أول حضور",
  "آخر حضور",
  "عدد الأحداث",
  "الشفتات المسجلة (الرمز / الاسم / الأوقات)",
];
export function leaderDetailRows(rows: LeaderReportRow[]) {
  return rows.map((r) => [
    r.teamLeaderName,
    r.employee.department.name,
    r.employee.employeeNumber,
    r.employee.fullName,
    r.employee.normalizedEmail,
    r.attendanceDate.toISOString().slice(0, 10),
    statusNames[r.status] || "تاريخ التوظيف غير متوفر",
    r.checkInAt?.toLocaleTimeString("en-GB", { timeZone: "Asia/Baghdad" }) ||
      "—",
    r.historyUnknown
      ? "غير مكتملة"
      : r.eligible
        ? "فعال في التاريخ"
        : "غير فعال في التاريخ",
    r.firstCheckInAt?.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Baghdad",
    }) || "—",
    r.lastCheckInAt?.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Baghdad",
    }) || "—",
    String(r.eventCount),
    r.shiftLabels?.length ? r.shiftLabels.join("؛ ") : NO_SHIFT,
  ]);
}
export async function exportLeaderReport(
  report: {
    rows: LeaderReportRow[];
    groups: LeaderGroup[];
    historyIncomplete: boolean;
  },
  pdf: boolean,
) {
  if (pdf) {
    const rows = report.groups.flatMap((g) => [
      [
        g.name,
        "ملخص",
        String(g.totalAssignedActiveEmployees),
        "موظفون فريدون",
        "",
        "",
        `حضور ${g.present} / غياب ${g.absent} / بعذر ${g.excused}`,
        `${g.percentage}%`,
        `أيام موظفين ${g.employeeDays}; مجهولة ${g.unknownEmployeeDays}`,
        "",
        "",
        "",
        "",
      ],
      ...leaderDetailRows(
        report.rows.filter((r) => (r.teamLeaderId || "unassigned") === g.id),
      ),
    ]);
    return pdfReport(
      "تقرير الحضور حسب الليدرية — الإجمالي يحتسب أيام الموظفين",
      rows,
      undefined,
      leaderDetailHeaders,
    );
  }
  const book = new ExcelJS.Workbook();
  const summary = book.addWorksheet("ملخص الليدرية", {
    views: [{ rightToLeft: true }],
  });
  summary.addRow([
    "الليدر",
    "موظفون فريدون",
    "أيام الموظفين",
    "حضور",
    "غياب / عدم تسجيل",
    "بعذر",
    "نسبة الحضور",
    "أيام تاريخها غير معلوم",
  ]);
  report.groups.forEach((g) =>
    summary.addRow([
      g.name,
      g.totalAssignedActiveEmployees,
      g.employeeDays,
      g.present,
      g.absent,
      g.excused,
      g.percentage,
      g.unknownEmployeeDays,
    ]),
  );
  const details = book.addWorksheet("تفاصيل الحضور", {
    views: [{ rightToLeft: true }],
  });
  details.addRow(leaderDetailHeaders);
  leaderDetailRows(report.rows).forEach((row) => details.addRow(row));
  const notes = book.addWorksheet("ملاحظات");
  notes.addRow([
    "التعيين يعكس تاريخ النفاذ بتوقيت بغداد؛ إعادة التعيين نافذة من اليوم التالي. فلتر الحالة يخص التفاصيل، والمقام يشمل جميع أيام الموظفين الفعالة.",
  ]);
  notes.addRow([
    report.historyIncomplete
      ? "التاريخ السابق لبدء السجل غير مكتمل؛ لا يُحتسب غياب افتراضي للأيام مجهولة الحالة."
      : "التغطية التاريخية مكتملة للفترة المختارة.",
  ]);
  for (const sheet of [summary, details]) {
    sheet.columns.forEach((c) => (c.width = 25));
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = {
      from: "A1",
      to: { row: 1, column: sheet.columnCount },
    };
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
