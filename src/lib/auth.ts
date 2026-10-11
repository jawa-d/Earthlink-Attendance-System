import { cookies } from "next/headers";
import { createHmac, randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
export const COOKIE = "earthlink_session";
export function tokenHash(token: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(token).digest("hex");
}
export const permissions = {
  read: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  write: ["SUPER_ADMIN", "ADMIN"],
  super: ["SUPER_ADMIN"],
} as const;
export function permitted(role: Role, access: keyof typeof permissions) {
  return (permissions[access] as readonly string[]).includes(role);
}
export async function currentAdmin() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: tokenHash(token) },
    include: { admin: true },
  });
  return session && session.expiresAt > new Date() && session.admin.isActive
    ? session.admin
    : null;
}
export async function authorize(access: keyof typeof permissions = "read") {
  const admin = await currentAdmin();
  if (!admin) throw new HttpError(401, "يرجى تسجيل الدخول");
  if (!permitted(admin.role, access))
    throw new HttpError(403, "ليست لديك صلاحية");
  return admin;
}
export async function createSession(adminId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 8 * 3600000);
  await db.session.create({
    data: { id: tokenHash(token), adminId, expiresAt },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}
export async function rateLimit(key: string, limit: number, minutes: number) {
  const bucket = Math.floor(Date.now() / (minutes * 60000));
  const id = tokenHash(`${key}:${bucket}`);
  const row = await db.rateLimit.upsert({
    where: { key: id },
    create: {
      key: id,
      count: 1,
      expiresAt: new Date((bucket + 1) * minutes * 60000),
    },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit)
    throw new HttpError(429, "محاولات كثيرة، يرجى الانتظار");
}
