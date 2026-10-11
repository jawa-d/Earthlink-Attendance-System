import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { handle, sameOrigin, HttpError } from "@/lib/http";
import { lockAssignments, recordAssignment } from "@/lib/team-leaders";
import { reason } from "@/lib/validation";
import { audit } from "@/lib/service";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    sameOrigin(req);
    const admin = await authorize("write");
    const { id } = await ctx.params;
    z.uuid().parse(id);
    const data = z
      .object({
        targetLeaderId: z.uuid(),
        deactivateSource: z.boolean().default(false),
        reason,
      })
      .parse(await req.json());
    if (id === data.targetLeaderId) throw new HttpError(400, "اختر ليدراً آخر");
    return db.$transaction(
      async (tx) => {
        await lockAssignments(tx);
        const source = await tx.teamLeader.findUnique({ where: { id } });
        const target = await tx.teamLeader.findUnique({
          where: { id: data.targetLeaderId },
        });
        if (
          !source ||
          !target?.isActive ||
          target.departmentId !== source.departmentId
        )
          throw new HttpError(400, "اختر ليدراً فعالاً من القسم نفسه");
        const department = await tx.department.findUnique({
          where: { id: source.departmentId },
        });
        if (!department?.isActive) throw new HttpError(400, "القسم غير فعال");
        const employees = await tx.employee.findMany({
          where: { teamLeaderId: id, deletedAt: null },
          orderBy: { id: "asc" },
        });
        for (const old of employees) {
          if (old.departmentId !== target.departmentId)
            throw new HttpError(
              409,
              "يوجد موظف من قسم مختلف؛ أعد تعيينه منفرداً",
            );
          await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${old.id}::uuid FOR UPDATE`;
          const row = await tx.employee.update({
            where: { id: old.id },
            data: { teamLeaderId: target.id },
          });
          await recordAssignment(tx, row);
          await audit(
            tx,
            admin.id,
            "REASSIGN",
            "Employee",
            row.id,
            { teamLeaderId: id },
            { teamLeaderId: target.id },
            data.reason,
          );
        }
        if (data.deactivateSource)
          await tx.teamLeader.update({
            where: { id },
            data: { isActive: false },
          });
        await audit(
          tx,
          admin.id,
          "REASSIGN",
          "TeamLeader",
          id,
          source,
          {
            targetLeaderId: target.id,
            count: employees.length,
            deactivated: data.deactivateSource,
          },
          data.reason,
        );
        return Response.json({
          count: employees.length,
          effective: "next-baghdad-day",
        });
      },
      { timeout: 30000 },
    );
  });
}
