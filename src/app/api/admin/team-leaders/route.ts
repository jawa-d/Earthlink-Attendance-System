import { readJson } from "@/lib/request-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { handle, sameOrigin, HttpError } from "@/lib/http";
import { leaderSchema, lockAssignments } from "@/lib/team-leaders";
import { reason } from "@/lib/validation";
import { audit } from "@/lib/service";
export async function GET(req: Request) {
  return handle(async () => {
    await authorize("read");
    const p = new URL(req.url).searchParams;
    const departmentId = p.get("department")
      ? z.uuid().parse(p.get("department"))
      : undefined;
    const q = (p.get("q") || "").slice(0, 120);
    return Response.json(
      await db.teamLeader.findMany({
        where: {
          departmentId,
          ...(p.get("active") === "true"
            ? { isActive: true }
            : p.get("active") === "false"
              ? { isActive: false }
              : {}),
          ...(q
            ? {
                OR: [
                  { fullName: { contains: q, mode: "insensitive" as const } },
                  {
                    employeeNumber: {
                      contains: q,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          department: true,
          _count: { select: { employees: { where: { deletedAt: null } } } },
        },
        orderBy: { fullName: "asc" },
      }),
    );
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const admin = await authorize("write");
    const { reason: note, ...data } = leaderSchema
      .extend({ reason })
      .parse(await readJson(req));
    return db.$transaction(async (tx) => {
      await lockAssignments(tx);
      const department = await tx.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department?.isActive) throw new HttpError(400, "القسم غير فعال");
      const row = await tx.teamLeader.create({ data });
      await audit(
        tx,
        admin.id,
        "CREATE",
        "TeamLeader",
        row.id,
        null,
        row,
        note,
      );
      return Response.json(row, { status: 201 });
    });
  });
}
