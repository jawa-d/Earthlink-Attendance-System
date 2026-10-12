import { getAttendanceList, attendanceFilters } from "@/lib/attendance-list";
import { readImportForm } from "@/lib/request-body";
import { validateXlsxArchive } from "@/lib/xlsx-safety";
import { NO_SHIFT } from "@/lib/shift-display";
import ExcelJS from "exceljs";
import { authorize } from "@/lib/auth";
import { handle, HttpError, sameOrigin } from "@/lib/http";
import { db } from "@/lib/db";
import {
  employeeSchema,
  reason,
} from "@/lib/validation";
import { pdfReport, spreadsheet, statusNames, headers } from "@/lib/export";
import { z } from "zod";
import { audit } from "@/lib/service";
import { getLeaderReport } from "@/lib/leader-report-service";
import { exportLeaderReport } from "@/lib/leader-report-export";
import {
  lockAssignments,
  validateLeaderAssignment,
  recordAssignment,
} from "@/lib/team-leaders";
export async function GET(req: Request) {
  return handle(async () => {
    await authorize();
    const p = new URL(req.url).searchParams;
    if (p.get("kind") === "employees") {
      const employees = await db.employee.findMany({
        where: {
          deletedAt: null,
          ...(p.get("department")
            ? { departmentId: z.uuid().parse(p.get("department")) }
            : {}),
          ...(p.get("teamLeader")
            ? {
                teamLeaderId:
                  p.get("teamLeader") === "unassigned"
                    ? null
                    : z.uuid().parse(p.get("teamLeader")),
              }
            : {}),
        },
        include: { department: true, teamLeader: true },
        orderBy: { fullName: "asc" },
      });
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("Employees", {
        views: [{ rightToLeft: true }],
      });
      sheet.addRow([
        "employeeNumber",
        "fullName",
        "normalizedEmail",
        "departmentId",
        "status",
        "department",
        "teamLeaderId",
        "teamLeader",
      ]);
      employees.forEach((e) =>
        sheet.addRow([
          e.employeeNumber,
          e.fullName,
          e.normalizedEmail,
          e.departmentId,
          e.status,
          e.department.name,
          e.teamLeaderId || "",
          e.teamLeader?.fullName || "",
        ]),
      );
      sheet.columns.forEach((c) => (c.width = 30));
      sheet.autoFilter = "A1:H1";
      return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="employees.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (p.get("kind") !== "attendance" && (p.get("group") === "team-leader" || p.get("teamLeader"))) {
      const pdf = p.get("format") === "pdf";
      const buffer = await exportLeaderReport(await getLeaderReport(p), pdf);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": pdf
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="team-leader-attendance.${pdf ? "pdf" : "xlsx"}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const result = await getAttendanceList(p, true);
    const leaderId = attendanceFilters(p).leader;
    const leader = leaderId && leaderId !== "unassigned" ? await db.teamLeader.findUnique({ where: { id: leaderId } }) : null;
    const title = "تقرير الحضور — Earthlink" + (leaderId ? " — الليدر المسؤول: " + (leader?.fullName || (leaderId === "unassigned" ? "بدون ليدر" : "غير معروف")) : "");
    const rows = result.rows.map(r => [r.employee.employeeNumber, r.employee.fullName, r.employee.normalizedEmail, r.employee.department.name, r.attendanceDate.toISOString().slice(0, 10), r.checkInAt?.toLocaleTimeString("en-GB", { timeZone: "Asia/Baghdad" }) || "—", statusNames[r.status], r.registrationMethod || "—", r.teamLeaderName,
      r.shiftCodeSnapshot || "—", r.shiftNameSnapshot || NO_SHIFT, r.shiftStartTimeSnapshot || "—", r.shiftEndTimeSnapshot || "—", r.shiftBusinessDate?.toISOString().slice(0, 10) || "—"]);
    const columns = [...headers, "الليدر المسؤول", "رمز الشفت", "اسم الشفت", "بداية الشفت (بغداد)", "نهاية الشفت (بغداد)", "تاريخ بداية الشفت"];
    const pdf = p.get("format") === "pdf";
    const buffer = pdf ? await pdfReport(title, rows, undefined, columns) : await spreadsheet(rows, title, columns);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": pdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendance.${pdf ? "pdf" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const admin = await authorize("write");
    const form = await readImportForm(req);
    const note = reason.parse(form.get("reason"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000)
      throw new HttpError(400, "ملف Excel مطلوب، بحد أقصى 2MB");
    const book = new ExcelJS.Workbook();
    const bytes = Buffer.from(await file.arrayBuffer());
    validateXlsxArchive(bytes);
    try { await book.xlsx.load(bytes as never); }
    catch { throw new HttpError(400, "ملف Excel غير صالح"); }
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 501)
      throw new HttpError(400, "الحد الأقصى 500 موظف");
    const expected = [
      "employeeNumber",
      "fullName",
      "normalizedEmail",
      "departmentId",
      "status",
    ];
    if (expected.some((s, i) => sheet.getRow(1).getCell(i + 1).text !== s))
      throw new HttpError(400, "استخدم أعمدة ملف تصدير الموظفين");
    const rows: z.infer<typeof employeeSchema>[] = [];
    let leaderColumn = 0;
    sheet.getRow(1).eachCell((cell, index) => {
      if (cell.text === "teamLeaderId") leaderColumn = index;
    });
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.hasValues) continue;
      rows.push(
        employeeSchema.parse(
          Object.fromEntries([
            ...expected.map((key, j) => [key, row.getCell(j + 1).text]),
            ...(leaderColumn
              ? [["teamLeaderId", row.getCell(leaderColumn).text]]
              : []),
          ]),
        ),
      );
    }
    await db.$transaction(
      async (tx) => {
        await lockAssignments(tx);
        for (const data of rows) {
          const department = await tx.department.findUnique({
            where: { id: data.departmentId },
          });
          if (!department?.isActive) throw new HttpError(400, "قسم غير فعال");
          await validateLeaderAssignment(
            tx,
            data.departmentId,
            data.status,
            data.teamLeaderId,
          );
          const row = await tx.employee.create({
            data: {
              ...data,
              deactivatedAt: data.status === "INACTIVE" ? new Date() : null,
            },
          });
          await recordAssignment(tx, row, new Date(), true);
          await audit(
            tx,
            admin.id,
            "IMPORT",
            "Employee",
            row.id,
            null,
            row,
            note,
          );
        }
      },
      { timeout: 30000 },
    );
    return Response.json({ imported: rows.length });
  });
}
