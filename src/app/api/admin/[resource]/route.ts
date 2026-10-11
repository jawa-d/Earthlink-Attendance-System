import { getAttendanceList } from "@/lib/attendance-list";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { departmentFields } from "@/lib/departments";
import { summarizeAttendanceDay } from "@/lib/attendance-summary";
import {
  lockAssignments,
  validateLeaderAssignment,
  recordAssignment,
} from "@/lib/team-leaders";
import { handle, HttpError, sameOrigin } from "@/lib/http";
import {
  attendanceSchema,
  businessDate,
  dateValue,
  employeeSchema,
  reason,
} from "@/lib/validation";
import { audit } from "@/lib/service";
type Context = { params: Promise<{ resource: string }> };
export async function GET(req: Request, ctx: Context) {
  return handle(async () => {
    const { resource } = await ctx.params;
    const admin = await authorize(
      ["audit-logs", "settings", "admins"].includes(resource)
        ? "super"
        : "read",
    );
    const p = new URL(req.url).searchParams;
    const page = Math.max(1, Number(p.get("page")) || 1);
    const take = 25;
    const q = (p.get("q") || "").slice(0, 120);
    const departmentId = p.get("department") || undefined;
    if (resource === "profile")
      return Response.json({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      });
    if (resource === "history") {
      const entityId = z.uuid().parse(p.get("entityId"));
      const where = {
        entityId,
        entityType: { in: ["Employee", "AttendanceRecord"] },
      };
      return Response.json({
        rows: await db.auditLog.findMany({
          where,
          include: { actorAdmin: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 25,
          skip: (page - 1) * take,
        }),
        total: await db.auditLog.count({ where }),
        page,
      });
    }
    if (resource === "departments")
      return Response.json(
        await db.department.findMany({
          where: {
            ...(p.get("active") === "true"
              ? { isActive: true }
              : p.get("active") === "false"
                ? { isActive: false }
                : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    {
                      englishName: {
                        contains: q,
                        mode: "insensitive" as const,
                      },
                    },
                    { code: { contains: q, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          include: { _count: { select: { employees: true } } },
          orderBy: { name: "asc" },
        }),
      );
    if (resource === "settings")
      return Response.json(await db.systemSetting.findMany());
    if (resource === "admins")
      return Response.json(
        await db.adminUser.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        }),
      );
    if (resource === "audit-logs") {
      const where: Prisma.AuditLogWhereInput = {
        ...(p.get("entityId") ? { entityId: p.get("entityId")! } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: "insensitive" } },
                { reason: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      return Response.json({
        rows: await db.auditLog.findMany({
          where,
          include: { actorAdmin: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * take,
          take,
        }),
        total: await db.auditLog.count({ where }),
        page,
      });
    }
    if (resource === "employees") {
      const where: Prisma.EmployeeWhereInput = {
        deletedAt: null,
        departmentId,
        ...(p.get("teamLeader")
          ? {
              teamLeaderId:
                p.get("teamLeader") === "unassigned"
                  ? null
                  : z.uuid().parse(p.get("teamLeader")),
            }
          : {}),
        ...(p.get("status")
          ? { status: z.enum(["ACTIVE", "INACTIVE"]).parse(p.get("status")) }
          : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { normalizedEmail: { contains: q, mode: "insensitive" } },
                { employeeNumber: { contains: q } },
              ],
            }
          : {}),
      };
      const sort = z
        .enum(["fullName", "employeeNumber", "createdAt"])
        .catch("fullName")
        .parse(p.get("sort"));
      return Response.json({
        rows: await db.employee.findMany({
          where,
          include: { department: true, teamLeader: true },
          orderBy: { [sort]: p.get("order") === "desc" ? "desc" : "asc" },
          skip: (page - 1) * take,
          take,
        }),
        total: await db.employee.count({ where }),
        page,
      });
    }
    if (resource === "attendance" || resource === "reports") {
      return Response.json(await getAttendanceList(p), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (resource === "dashboard") {
      const today = dateValue(p.get("date") || businessDate());
      const employees = await db.employee.count({
        where: { status: "ACTIVE", deletedAt: null },
      });
      const rows = await db.attendanceRecord.findMany({
        where: { attendanceDate: today, deletedAt: null },
        include: { employee: { include: { department: true } } },
        orderBy: { checkInAt: "desc" },
      });
      const activeRows = rows.filter(
        (r) => r.employee.status === "ACTIVE" && !r.employee.deletedAt,
      );
      const uniqueDays = [
        ...new Set(activeRows.map((row) => row.employeeId)),
      ].map((id) =>
        summarizeAttendanceDay(
          activeRows.filter((row) => row.employeeId === id),
        ),
      );
      const counts = Object.fromEntries(
        ["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((s) => [
          s,
          uniqueDays.filter((day) => day.status === s).length,
        ]),
      );
      const trends = await db.attendanceRecord.findMany({
        distinct: ["employeeId", "attendanceDate"],
        select: { attendanceDate: true, employeeId: true },
        where: {
          deletedAt: null,
          status: { in: ["PRESENT", "LATE"] },
          checkInAt: { not: null },
          attendanceDate: {
            gte: new Date(today.getTime() - 29 * 86400000),
            lte: today,
          },
        },
        orderBy: { attendanceDate: "asc" },
      });
      const yearly = await db.attendanceRecord.findMany({
        distinct: ["employeeId", "attendanceDate"],
        select: { attendanceDate: true, employeeId: true },
        where: {
          deletedAt: null,
          status: { in: ["PRESENT", "LATE"] },
          checkInAt: { not: null },
          attendanceDate: {
            gte: new Date(`${today.getUTCFullYear()}-01-01T00:00:00Z`),
            lte: today,
          },
        },
      });
      const monthly = Array.from(
        { length: today.getUTCMonth() + 1 },
        (_, month) => ({
          month: String(month + 1).padStart(2, "0"),
          total: yearly.filter((r) => r.attendanceDate.getUTCMonth() === month)
            .length,
        }),
      );
      const departments = await db.department.findMany({
        include: {
          employees: {
            where: { status: "ACTIVE", deletedAt: null },
            include: {
              attendance: { where: { attendanceDate: today, deletedAt: null } },
            },
          },
        },
      });
      return Response.json({
        employees,
        registered: uniqueDays.filter((day) => day.firstCheckInAt).length,
        unregistered: Math.max(0, employees - uniqueDays.length),
        counts,
        monthly,
        rows: rows.slice(0, 25),
        trends: [
          ...new Set(
            trends.map((row) => row.attendanceDate.toISOString().slice(0, 10)),
          ),
        ].map((day) => ({
          date: day.slice(5, 10),
          total: trends.filter(
            (row) => row.attendanceDate.toISOString().slice(0, 10) === day,
          ).length,
        })),
        departments: departments.map((d) => ({
          name: d.name,
          total: d.employees.filter(
            (e) => summarizeAttendanceDay(e.attendance).present,
          ).length,
        })),
      });
    }
    throw new HttpError(404, "غير موجود");
  });
}
export async function POST(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const { resource } = await ctx.params;
    const admin = await authorize(
      ["settings", "admins", "departments"].includes(resource)
        ? "super"
        : "write",
    );
    const body = await req.json();
    return db.$transaction(async (tx) => {
      if (resource === "employees") {
        await lockAssignments(tx);
        const data = employeeSchema.parse(body);
        const note = reason.parse(body.reason);
        const department = await tx.department.findUnique({
          where: { id: data.departmentId },
        });
        if (!department?.isActive) throw new HttpError(400, "القسم غير فعال");
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
          "CREATE",
          "Employee",
          row.id,
          null,
          row,
          note,
        );
        return Response.json(row, { status: 201 });
      }
      if (resource === "attendance") {
        const data = attendanceSchema.parse(body);
        const employee = await tx.employee.findUnique({
          where: { id: data.employeeId },
        });
        if (!employee || employee.deletedAt)
          throw new HttpError(400, "الموظف غير متاح");
        const row = await tx.attendanceRecord.create({
          data: {
            employeeId: data.employeeId,
            attendanceDate: dateValue(data.attendanceDate),
            checkInAt: data.checkInAt ? new Date(data.checkInAt) : null,
            originalCheckInAt: data.checkInAt ? new Date(data.checkInAt) : null,
            status: data.status,
            registrationMethod: "ADMIN",
            createdByAdminId: admin.id,
            modificationReason: data.reason,
          },
        });
        await audit(
          tx,
          admin.id,
          "CREATE",
          "AttendanceRecord",
          row.id,
          null,
          row,
          data.reason,
        );
        return Response.json(row, { status: 201 });
      }
      if (resource === "departments") {
        const data = departmentFields
          .extend({ reason, isActive: z.boolean().default(true) })
          .parse(body);
        const { reason: note, ...fields } = data;
        const row = await tx.department.create({ data: fields });
        await audit(
          tx,
          admin.id,
          "CREATE",
          "Department",
          row.id,
          null,
          row,
          note,
        );
        return Response.json(row, { status: 201 });
      }
      if (resource === "settings") {
        const data = z
          .object({
            key: z.enum(["departmentTitle", "supportEmail"]),
            value: z.string().trim().max(200),
            reason,
          })
          .parse(body);
        const old = await tx.systemSetting.findUnique({
          where: { key: data.key },
        });
        const row = await tx.systemSetting.upsert({
          where: { key: data.key },
          create: { key: data.key, value: data.value },
          update: { value: data.value },
        });
        await audit(
          tx,
          admin.id,
          "UPDATE",
          "SystemSetting",
          row.id,
          old,
          row,
          data.reason,
        );
        return Response.json(row);
      }
      if (resource === "admins") {
        const data = z
          .object({
            name: z.string().min(2).max(120),
            email: z.email().toLowerCase(),
            password: z.string().min(14).max(256),
            role: z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]),
            reason,
          })
          .parse(body);
        const row = await tx.adminUser.create({
          data: {
            name: data.name,
            email: data.email,
            role: data.role,
            passwordHash: await hash(data.password),
          },
        });
        await audit(
          tx,
          admin.id,
          "CREATE",
          "AdminUser",
          row.id,
          null,
          { name: row.name, email: row.email, role: row.role },
          data.reason,
        );
        return Response.json({ id: row.id }, { status: 201 });
      }
      throw new HttpError(404, "غير موجود");
    });
  });
}
