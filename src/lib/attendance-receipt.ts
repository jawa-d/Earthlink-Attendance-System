import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
const COOKIE = "earthlink-attendance-receipt";
const TTL = 48 * 3600;
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Attendance receipt secret is not configured");
  return createHash("sha256")
    .update("earthlink:attendance-receipt:v1:")
    .update(secret)
    .digest();
}
export function encodeReceipt(employeeId: string, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ employeeId, expiresAt: now + TTL * 1000 })),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function decodeReceipt(value: string, now = Date.now()) {
  try {
    if (value.length > 1024) return null;
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = z
      .object({ employeeId: z.uuid(), expiresAt: z.number().int() })
      .parse(
        JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(28)),
            decipher.final(),
          ]).toString("utf8"),
        ),
      );
    return data.expiresAt > now ? data : null;
  } catch {
    return null;
  }
}
export async function issueAttendanceReceipt(employeeId: string) {
  (await cookies()).set(COOKIE, encodeReceipt(employeeId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/attendance",
    maxAge: TTL,
  });
}
export async function readAttendanceReceipt() {
  const value = (await cookies()).get(COOKIE)?.value;
  return value ? decodeReceipt(value) : null;
}
export async function clearAttendanceReceipt() {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/attendance",
    maxAge: 0,
  });
}
