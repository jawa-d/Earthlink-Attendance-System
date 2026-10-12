import { readJson } from "@/lib/request-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { departmentFields } from "@/lib/departments";
import {
  lockAssignments,
  validateLeaderAssignment,
  recordAssignment,
} from "@/lib/team-leaders";
import { authorize } from "@/lib/auth";
import { handle, HttpError, sameOrigin } from "@/lib/http";
import {
  attendanceSchema,
  dateValue,
  employeeSchema,
  reason,
} from "@/lib/validation";
import { audit } from "@/lib/service";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const { resource, id } = await ctx.params;
    z.uuid().parse(id);
    const admin = await authorize(
      resource === "admins" || resource === "departments" ? "super" : "write",
    );
    const body = await readJson(req);
    const note = reason.parse(body.reason);
    return db.$transaction(async (tx) => {
      if (resource === "employees") {
        await lockAssignments(tx);
        await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${id}::uuid FOR UPDATE`;
        const old = await tx.employee.findUnique({ where: { id } });
        if (!old || old.deletedAt) throw new HttpError(404, "غير موجود");
        const parsed = employeeSchema.parse(body);
        const data = {
          ...parsed,
          teamLeaderId:
            parsed.teamLeaderId === undefined
              ? old.teamLeaderId
              : parsed.teamLeaderId,
        };
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
        const row = await tx.employee.update({
          where: { id },
          data: {
            ...data,
            deactivatedAt:
              data.status === "INACTIVE"
                ? old.deactivatedAt || new Date()
                : null,
          },
        });
        if (
          old.teamLeaderId !== row.teamLeaderId ||
          old.departmentId !== row.departmentId ||
          old.status !== row.status
        )
          await recordAssignment(tx, row);
        await audit(
          tx,
          admin.id,
          old.teamLeaderId !== row.teamLeaderId ? "REASSIGN" : "UPDATE",
          "Employee",
          id,
          old,
          row,
          note,
        );
        return Response.json(row);
      }
      if (resource === "attendance") {
        await tx.$queryRaw`SELECT id FROM "AttendanceRecord" WHERE id=${id}::uuid FOR UPDATE`;
        const old = await tx.attendanceRecord.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "غير موجود");
        if (body.restore) {
          if (admin.role !== "SUPER_ADMIN")
            throw new HttpError(403, "الاستعادة للمسؤول الأعلى");
          const row = await tx.attendanceRecord.update({
            where: { id },
            data: { deletedAt: null, modificationReason: note },
          });
          await audit(
            tx,
            admin.id,
            "RESTORE",
            "AttendanceRecord",
            id,
            old,
            row,
            note,
          );
          return Response.json(row);
        }
        if (old.deletedAt) throw new HttpError(409, "السجل محذوف");
        const data = attendanceSchema.parse(body);
        if (data.shiftId !== undefined && data.shiftId !== (old.shiftId || null))
          throw new HttpError(400, "لا يمكن تغيير الشفت التاريخي لسجل الحضور");
        const employee = await tx.employee.findUnique({
          where: { id: data.employeeId },
        });
        if (!employee || employee.deletedAt)
          throw new HttpError(400, "الموظف غير متاح");
        const row = await tx.attendanceRecord.update({
          where: { id },
          data: {
            employeeId: data.employeeId,
            attendanceDate: dateValue(data.attendanceDate),
            status: data.status,
            ...(data.checkInAt !== undefined
              ? { checkInAt: data.checkInAt ? new Date(data.checkInAt) : null }
              : {}),
            modificationReason: note,
          },
        });
        await audit(
          tx,
          admin.id,
          "UPDATE",
          "AttendanceRecord",
          id,
          old,
          row,
          note,
        );
        return Response.json(row);
      }
      if (resource === "admins") {
        const data = z
          .object({
            role: z.enum(["SUPER_ADMIN", "ADMIN", "VIEWER"]),
            isActive: z.boolean(),
          })
          .parse(body);
        if (id === admin.id)
          throw new HttpError(400, "لا يمكنك تغيير صلاحيات حسابك");
        const old = await tx.adminUser.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!old) throw new HttpError(404, "غير موجود");
        const row = await tx.adminUser.update({
          where: { id },
          data,
          select: { id: true, role: true, isActive: true },
        });
        await tx.session.deleteMany({ where: { adminId: id } });
        await audit(
          tx,
          admin.id,
          "PERMISSIONS",
          "AdminUser",
          id,
          old,
          row,
          note,
        );
        return Response.json(row);
      }
      if (resource === "departments") {
        const data = departmentFields
          .partial()
          .extend({ isActive: z.boolean().optional() })
          .refine(
            (value) => Object.values(value).some((v) => v !== undefined),
            "حدد بيانات التغيير",
          )
          .parse(body);
        const old = await tx.department.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "القسم غير موجود");
        const row = await tx.department.update({ where: { id }, data });
        await audit(tx, admin.id, "UPDATE", "Department", id, old, row, note);
        return Response.json(row);
      }
      throw new HttpError(404, "غير موجود");
    });
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const { resource, id } = await ctx.params;
    z.uuid().parse(id);
    const admin = await authorize(
      resource === "departments" ? "super" : "write",
    );
    const note = reason.parse((await readJson(req)).reason);
    return db.$transaction(async (tx) => {
      if (resource === "departments") {
        // Never physically delete departments, including those linked to history.
        throw new HttpError(
          409,
          "لا يمكن حذف الأقسام نهائياً. استخدم إيقاف القسم للحفاظ على الموظفين وسجل الحضور.",
        );
      }
      if (resource === "employees") {
        await lockAssignments(tx);
        await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${id}::uuid FOR UPDATE`;
        const old = await tx.employee.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "غير موجود");
        const row = await tx.employee.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            status: "INACTIVE",
            deactivatedAt: new Date(),
          },
        });
        await recordAssignment(tx, row);
        await audit(tx, admin.id, "DELETE", "Employee", id, old, row, note);
        return Response.json({ ok: true });
      }
      if (resource === "attendance") {
        await tx.$queryRaw`SELECT id FROM "AttendanceRecord" WHERE id=${id}::uuid FOR UPDATE`;
        const old = await tx.attendanceRecord.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "غير موجود");
        const row = await tx.attendanceRecord.update({
          where: { id },
          data: { deletedAt: new Date(), modificationReason: note },
        });
        await audit(
          tx,
          admin.id,
          "DELETE",
          "AttendanceRecord",
          id,
          old,
          row,
          note,
        );
        return Response.json({ ok: true });
      }
      throw new HttpError(404, "غير موجود");
    });
  });
}
