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
        email: z.email().toLowerCase(),
        password: z.string().min(1).max(256),
      })
      .parse(await req.json());
    await rateLimit(`login:${email}`, 5, 15);
    await rateLimit("login:global", 100, 15);
    const admin = await db.adminUser.findUnique({ where: { email } });
    const dummy =
      "$argon2id$v=19$m=19456,t=2,p=1$MTIzNDU2Nzg5MDEyMzQ1Ng$HzwJy4Bw8V+rAZHr23SLfSNmGtmsRKVTdlKLV+RYRnQ";
    const ok = await verify(admin?.passwordHash || dummy, password).catch(
      () => false,
    );
    if (!admin || !admin.isActive || !ok)
      throw new HttpError(401, "بيانات الدخول غير صحيحة");
    await createSession(admin.id);
    return Response.json({ ok: true });
  });
}
