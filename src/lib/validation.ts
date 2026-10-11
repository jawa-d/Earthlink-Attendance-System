import { z } from "zod";
export const corporateEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .refine(
    (v) => v.split("@")[1] === "earthlink.iq",
    "يرجى إدخال بريد إلكتروني صحيح ينتهي بـ @earthlink.iq",
  );
export const reason = z.string().trim().min(5).max(500);
export const employeeSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(2).max(120),
  normalizedEmail: corporateEmail,
  departmentId: z.uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  teamLeaderId: z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
  );
export const attendanceSchema = z
  .object({
    employeeId: z.uuid(),
    attendanceDate: dateSchema,
    checkInAt: z.iso.datetime({ offset: true }).nullable().optional(),
    status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED"]),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.checkInAt && businessDate(new Date(v.checkInAt)) !== v.attendanceDate)
      ctx.addIssue({
        code: "custom",
        message: "وقت الحضور لا يطابق التاريخ",
        path: ["checkInAt"],
      });
  });
export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dateValue(s: string) {
  return new Date(`${dateSchema.parse(s)}T00:00:00Z`);
}
export function qrUrl() {
  const url = new URL(process.env.QR_BASE_URL || "");
  if (
    url.protocol !== "https:" ||
    ["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Configure a production HTTPS QR_BASE_URL");
  return new URL("/attendance", url).href;
}
