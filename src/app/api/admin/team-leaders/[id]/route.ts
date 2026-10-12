import { readJson } from "@/lib/request-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { handle, sameOrigin, HttpError } from "@/lib/http";
import { leaderSchema, lockAssignments } from "@/lib/team-leaders";
import { reason } from "@/lib/validation";
import { audit } from "@/lib/service";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const admin = await authorize("write");
    const { id } = await ctx.params;
    z.uuid().parse(id);
    const { reason: note, ...data } = leaderSchema
      .extend({ reason })
      .parse(await readJson(req));
    return db.$transaction(async (tx) => {
      await lockAssignments(tx);
      const old = await tx.teamLeader.findUnique({ where: { id } });
      if (!old) throw new HttpError(404, "الليدر غير موجود");
      const department = await tx.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department?.isActive) throw new HttpError(400, "القسم غير فعال");
      if (
        old.departmentId !== data.departmentId &&
        (await tx.employee.count({
          where: { teamLeaderId: id, deletedAt: null },
        }))
      )
        throw new HttpError(
          409,
          "أعد تعيين الموظفين قبل نقل الليدر إلى قسم آخر",
        );
      const row = await tx.teamLeader.update({ where: { id }, data });
      await audit(
        tx,
        admin.id,
        old.isActive && !row.isActive ? "DEACTIVATE" : "UPDATE",
        "TeamLeader",
        id,
        old,
        row,
        note,
      );
      return Response.json(row);
    });
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await authorize("write");
    throw new HttpError(
      409,
      "لا يمكن حذف الليدرية نهائياً؛ استخدم الإيقاف وإعادة التعيين لحفظ التاريخ",
    );
  });
}
