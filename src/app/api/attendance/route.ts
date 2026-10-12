import { readJson } from "@/lib/request-body";
import { handle, sameOrigin } from "@/lib/http";
import { registerAttendance } from "@/lib/service";
import { rateLimit } from "@/lib/auth";
import { corporateEmail } from "@/lib/validation";
import { AttendanceCooldownError } from "@/lib/attendance-cooldown";
import { issueAttendanceReceipt } from "@/lib/attendance-receipt";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const body = await readJson(req);
    const email = corporateEmail.parse(body.email);
    await rateLimit(`attendance:${email}`, 8, 10);
    await rateLimit("attendance:global", 600, 10);
    try {
      const { employeeId, ...result } = body.shiftId === undefined
        ? await registerAttendance(email)
        : await registerAttendance(email, undefined, body.shiftId);
      await issueAttendanceReceipt(employeeId);
      return Response.json(result, {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if (!(error instanceof AttendanceCooldownError)) throw error;
      await issueAttendanceReceipt(error.employeeId);
      return Response.json(
        { error: error.message, code: "ATTENDANCE_COOLDOWN", ...error.times },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  });
}
