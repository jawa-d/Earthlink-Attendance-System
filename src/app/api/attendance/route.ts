import { handle, sameOrigin } from "@/lib/http";
import { registerAttendance } from "@/lib/service";
import { rateLimit } from "@/lib/auth";
import { corporateEmail } from "@/lib/validation";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const body = await req.json();
    const email = corporateEmail.parse(body.email);
    await rateLimit(`attendance:${email}`, 8, 10);
    await rateLimit("attendance:global", 600, 10);
    return Response.json(await registerAttendance(email), { status: 201 });
  });
}
