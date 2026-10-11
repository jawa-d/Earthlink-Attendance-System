import { cookies } from "next/headers";
import { COOKIE, tokenHash } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, sameOrigin } from "@/lib/http";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (token) await db.session.deleteMany({ where: { id: tokenHash(token) } });
    jar.delete(COOKIE);
    return Response.json({ ok: true });
  });
}
