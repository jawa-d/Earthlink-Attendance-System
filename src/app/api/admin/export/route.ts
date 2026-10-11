import ExcelJS from "exceljs";
import { authorize } from "@/lib/auth";
import { handle, HttpError, sameOrigin } from "@/lib/http";
import { db } from "@/lib/db";
import {
  businessDate,
  dateValue,
  employeeSchema,
  reason,
} from "@/lib/validation";
import { pdfReport, spreadsheet, statusNames } from "@/lib/export";
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
    if (p.get("group") === "team-leader" || p.get("teamLeader")) {
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
    const start = dateValue(p.get("start") || businessDate());
    const end = dateValue(p.get("end") || p.get("start") || businessDate());
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000)
      throw new HttpError(400, "فترة غير صالحة");
    const employees = await db.employee.findMany({
      where: {
        ...(p.get("department") ? { departmentId: p.get("department")! } : {}),
        ...(p.get("employee") ? { id: p.get("employee")! } : {}),
      },
      include: {
        department: true,
        attendance: {
          where: { deletedAt: null, attendanceDate: { gte: start, lte: end } },
          orderBy: { attendanceDate: "asc" },
        },
      },
    });
    const rows = employees.flatMap((e) => {
      if (p.get("status") === "UNREGISTERED") {
        const missing: string[][] = [];
        for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
          if (
            e.status === "ACTIVE" &&
            !e.deletedAt &&
            e.createdAt.getTime() < d.getTime() + 86400000 &&
            !e.attendance.some(
              (r) => r.attendanceDate.getTime() === d.getTime(),
            )
          )
            missing.push([
              e.employeeNumber,
              e.fullName,
              e.normalizedEmail,
              e.department.name,
              d.toISOString().slice(0, 10),
              "—",
              statusNames.UNREGISTERED,
              "—",
            ]);
        }
        return missing;
      }
      return e.attendance
        .filter((r) => !p.get("status") || r.status === p.get("status"))
        .map((r) => [
          e.employeeNumber,
          e.fullName,
          e.normalizedEmail,
          e.department.name,
          r.attendanceDate.toISOString().slice(0, 10),
          r.checkInAt?.toLocaleTimeString("en-GB", {
            timeZone: "Asia/Baghdad",
          }) || "—",
          statusNames[r.status],
          r.registrationMethod,
        ]);
    });
    const pdf = p.get("format") === "pdf";
    const buffer = pdf
      ? await pdfReport("تقرير الحضور — Earthlink", rows)
      : await spreadsheet(rows);
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
    const form = await req.formData();
    const note = reason.parse(form.get("reason"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2_000_000)
      throw new HttpError(400, "ملف Excel مطلوب، بحد أقصى 2MB");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
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
