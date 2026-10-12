import { z } from "zod";
import { authorize, rateLimit } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, sameOrigin, HttpError } from "@/lib/http";
import { readJson } from "@/lib/request-body";
import { reason } from "@/lib/validation";
import { shiftSchema, shiftTime } from "@/lib/shifts";
import { audit } from "@/lib/service";
const update = z
  .object({
    code: z.string().optional(),
    name: z.string().optional(),
    startTime: shiftTime.optional(),
    endTime: shiftTime.optional(),
    isActive: z.boolean().optional(),
    departmentIds: z.array(z.uuid()).max(100).optional(),
    reason,
  })
  .strict();
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const actor = await authorize("write");
    const id = z.uuid().parse((await ctx.params).id);
    await rateLimit(`shift-write:${actor.id}`, 40, 1);
    const { reason: note, ...fields } = update.parse(await readJson(req));
    if (!Object.keys(fields).length)
      throw new HttpError(400, "حدد بيانات التغيير");
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${id}::uuid FOR UPDATE`;
      const old = await tx.shift.findUnique({
        where: { id },
        include: { departments: true },
      });
      if (!old) throw new HttpError(404, "الشفت غير موجود");
      const { departmentIds, ...data } = shiftSchema.parse({
        ...old,
        departmentIds: old.departments.map((d) => d.departmentId),
        ...fields,
      });
      if (
        departmentIds.length &&
        (await tx.department.count({
          where: { id: { in: departmentIds } },
        })) !== departmentIds.length
      )
        throw new HttpError(400, "أحد الأقسام المحددة غير موجود");
      const row = await tx.shift.update({
        where: { id },
        data: {
          ...data,
          departments: {
            deleteMany: {},
            create: departmentIds.map((departmentId) => ({ departmentId })),
          },
        },
        include: { departments: true },
      });
      await audit(
        tx,
        actor.id,
        old.isActive && !row.isActive ? "DEACTIVATE" : "UPDATE",
        "Shift",
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
      "لا يمكن حذف الشفت نهائياً؛ استخدم الإيقاف لحفظ تاريخ الحضور",
    );
  });
}
