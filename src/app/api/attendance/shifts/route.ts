import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";
import { handle, HttpError, sameOrigin } from "@/lib/http";
import { readJson } from "@/lib/request-body";
import { corporateEmail } from "@/lib/validation";
import { shiftsEnabled } from "@/lib/shifts";
export async function GET() {
  return handle(async () => Response.json({ enabled: shiftsEnabled() }));
}
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const body = await readJson(req);
    if (!shiftsEnabled()) return Response.json({ enabled: false, shifts: [] });
    const email = corporateEmail.parse(body.email);
    await rateLimit(`shift-options:${email}`, 30, 10);
    await rateLimit("shift-options:global", 600, 10);
    const employee = await db.employee.findUnique({
      where: { normalizedEmail: email },
      select: { departmentId: true, status: true, deletedAt: true },
    });
    if (!employee || employee.status !== "ACTIVE" || employee.deletedAt)
      return Response.json({ enabled: true, shifts: [] });
    const shifts = await db.shift.findMany({
      where: {
        isActive: true,
        OR: [
          { departments: { none: {} } },
          { departments: { some: { departmentId: employee.departmentId } } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { code: "asc" },
      take: 1001,
    });
    if (shifts.length > 1000)
      throw new HttpError(
        503,
        "خيارات الشفتات غير متاحة حالياً؛ تواصل مع مسؤول القسم",
      );
    return Response.json({ enabled: true, shifts });
  });
}
