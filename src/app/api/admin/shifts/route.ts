import { z } from "zod";
import { authorize, rateLimit } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, sameOrigin, HttpError } from "@/lib/http";
import { readJson } from "@/lib/request-body";
import { pageNumber, reason } from "@/lib/validation";
import { shiftSchema, shiftsEnabled } from "@/lib/shifts";
import { audit } from "@/lib/service";
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await authorize("read");
    await rateLimit(`shift-read:${actor.id}`, 90, 1);
    const p = new URL(req.url).searchParams;
    const page = pageNumber(p);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(p.get("limit") || 25);
    const departmentId = p.get("department")
      ? z.uuid().parse(p.get("department"))
      : undefined;
    const active = p.get("active")
      ? z.enum(["true", "false"]).parse(p.get("active"))
      : undefined;
    const q = (p.get("q") || "").slice(0, 120);
    const where = {
      ...(active ? { isActive: active === "true" } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(departmentId
        ? {
            AND: [
              {
                OR: [
                  { departments: { none: {} } },
                  { departments: { some: { departmentId } } },
                ],
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await db.$transaction([
      db.shift.findMany({
        where,
        include: {
          departments: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
        orderBy: { code: "asc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      db.shift.count({ where }),
    ]);
    return Response.json({
      rows,
      total,
      page,
      attendanceEnabled: shiftsEnabled(),
    });
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const actor = await authorize("write");
    await rateLimit(`shift-write:${actor.id}`, 40, 1);
    const {
      reason: note,
      departmentIds,
      ...data
    } = shiftSchema
      .safeExtend({ reason })
      .strict()
      .parse(await readJson(req));
    return db.$transaction(async (tx) => {
      if (
        departmentIds.length &&
        (await tx.department.count({
          where: { id: { in: departmentIds } },
        })) !== departmentIds.length
      )
        throw new HttpError(400, "أحد الأقسام المحددة غير موجود");
      const row = await tx.shift.create({
        data: {
          ...data,
          departments: {
            create: departmentIds.map((departmentId) => ({ departmentId })),
          },
        },
        include: { departments: true },
      });
      await audit(tx, actor.id, "CREATE", "Shift", row.id, null, row, note);
      return Response.json(row, { status: 201 });
    });
  });
}
