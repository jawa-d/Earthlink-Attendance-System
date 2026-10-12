import { readJson } from "@/lib/request-body";
import { securityEvent } from "@/lib/security-events";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, rateLimit } from "@/lib/auth";
import { handle, HttpError, sameOrigin } from "@/lib/http";
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const { email, password } = z
      .object({
        email: z.email().max(254).toLowerCase(),
        password: z.string().min(1).max(256),
      })
      .parse(await readJson(req));
    await rateLimit(`login:${email}`, 5, 15);
    await rateLimit("login:global", 100, 15);
    const admin = await db.adminUser.findUnique({ where: { email } });
    const dummy =
      "$argon2id$v=19$m=19456,t=2,p=1$MTIzNDU2Nzg5MDEyMzQ1Ng$HzwJy4Bw8V+rAZHr23SLfSNmGtmsRKVTdlKLV+RYRnQ";
    const ok = await verify(admin?.passwordHash || dummy, password).catch(
      () => false,
    );
    if (!admin || !admin.isActive || !ok) {
      securityEvent("LOGIN_FAILURE", email);
      throw new HttpError(401, "بيانات الدخول غير صحيحة");
    }
    await createSession(admin.id);
    securityEvent("LOGIN_SUCCESS", admin.id);
    return Response.json({ ok: true });
  });
}
