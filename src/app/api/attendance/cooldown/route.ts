import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";
import { handle, sameOrigin } from "@/lib/http";
import {
  readAttendanceReceipt,
  clearAttendanceReceipt,
} from "@/lib/attendance-receipt";
import { cooldownTimes } from "@/lib/attendance-cooldown";
import { lastSuccessfulAttendance } from "@/lib/attendance-last-success";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    // This is a receipt-scoped revalidation, never an email/employee lookup API.
    const receipt = await readAttendanceReceipt();
    if (!receipt) return Response.json({ state: "unknown" }, { headers });
    await rateLimit(`attendance-receipt:${receipt.employeeId}`, 30, 10);
    const employee = await db.employee.findUnique({
      where: { id: receipt.employeeId },
      select: {
        status: true,
        deletedAt: true,
        lastSuccessfulAttendanceAt: true,
      },
    });
    if (!employee || employee.status !== "ACTIVE" || employee.deletedAt)
      return Response.json({ state: "unavailable" }, { headers });
    const last = await lastSuccessfulAttendance(db, {
      id: receipt.employeeId,
      lastSuccessfulAttendanceAt: employee.lastSuccessfulAttendanceAt,
    });
    const now = new Date();
    if (!last)
      return Response.json(
        { state: "ready", serverNow: now.toISOString() },
        { headers },
      );
    const times = cooldownTimes(last, now);
    return Response.json(
      {
        state:
          now.getTime() < Date.parse(times.nextAllowedAt)
            ? "cooldown"
            : "ready",
        ...times,
      },
      { headers },
    );
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    await clearAttendanceReceipt();
    return Response.json({ state: "unknown" }, { headers });
  });
}
