import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import ExcelJS from "exceljs";
import { Prisma, type AdminUser, type AttendanceDeletionSnapshot } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { rateLimit, tokenHash } from "./auth";
import { attendanceFilters } from "./attendance-list";
import { statusNames } from "./export-labels";
import { HttpError } from "./http";
import { audit } from "./service";
import { lockAssignments } from "./team-leaders";

export const deletionSelection = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(5000) }).strict(),
  z.object({ filters: z.record(z.string(), z.string().max(200)) }).strict(),
]);
type Selection = z.infer<typeof deletionSelection>;
type Actor = Pick<AdminUser, "id" | "passwordHash">;
const MAX_RECORDS = 5000;
const SNAPSHOT_MS = 15 * 60000;
const REAUTH_MS = 5 * 60000;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function matches(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function codeHash(id: string, sessionId: string, code: string) {
  return tokenHash(`attendance-delete:${id}:${sessionId}:${code}`);
}
export function exportReceipt(snapshot: AttendanceDeletionSnapshot) {
  return tokenHash(`attendance-backup:${snapshot.id}:${snapshot.sessionId}:${snapshot.fileHash}`);
}
export async function selectedDeletionRows(tx: Prisma.TransactionClient, selection: Selection) {
  let where: Prisma.AttendanceRecordWhereInput;
  if ("ids" in selection) where = { id: { in: [...new Set(selection.ids)] } };
  else {
    const f = attendanceFilters(new URLSearchParams(selection.filters));
    if (f.status === "UNREGISTERED") throw new HttpError(400, "لا يمكن حذف سجلات حضور غير مسجلة");
    where = f.where;
  }
  const records = await tx.attendanceRecord.findMany({
    where, orderBy: { id: "asc" }, take: MAX_RECORDS + 1,
    include: { employee: { select: {
      id: true, fullName: true, employeeNumber: true, normalizedEmail: true,
      department: { select: { name: true } },
      assignments: { orderBy: { effectiveFrom: "desc" }, select: {
        effectiveFrom: true, effectiveTo: true, teamLeaderId: true,
        leaderName: true, departmentId: true, departmentName: true,
      } },
    } } },
  });
  if (records.length > MAX_RECORDS) throw new HttpError(400, "حدد فترة أصغر: الحد الأقصى للعملية 5000 سجل");
  if ("ids" in selection && records.length !== new Set(selection.ids).size)
    throw new HttpError(409, "تغيرت السجلات المحددة. أعد تحديدها وتصدير النسخة الاحتياطية");
  return records.map(({ employee, ...record }) => {
    const assignment = employee.assignments.find(a => a.effectiveFrom <= record.attendanceDate && (!a.effectiveTo || record.attendanceDate < a.effectiveTo));
    return {
      ...record,
      employeeName: employee.fullName, employeeNumber: employee.employeeNumber,
      email: employee.normalizedEmail,
      departmentName: assignment?.departmentName || employee.department.name,
      historicalDepartmentId: assignment?.departmentId || null,
      teamLeaderId: assignment?.teamLeaderId || null,
      teamLeaderName: assignment ? assignment.leaderName || "بدون ليدر" : "غير معروف تاريخياً",
    };
  });
}
export async function prepareDeletion(actor: Actor, sessionId: string, selection: Selection) {
  await rateLimit(`attendance-delete:prepare:${actor.id}`, 10, 15);
  const id = randomUUID(), code = randomBytes(4).toString("hex").toUpperCase();
  return db.$transaction(async tx => {
    const records = await selectedDeletionRows(tx, selection);
    if (!records.length) throw new HttpError(400, "لا توجد سجلات تطابق التحديد");
    const expiresAt = new Date(Date.now() + SNAPSHOT_MS);
    await tx.attendanceDeletionSnapshot.create({ data: {
      id, adminId: actor.id, sessionId, selection: json(selection), records: json(records),
      fingerprint: fingerprint(json(records)), recordCount: records.length,
      codeHash: codeHash(id, sessionId, code), expiresAt,
    } });
    return { snapshotId: id, count: records.length, code, expiresAt: expiresAt.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
async function lockedSnapshot(tx: Prisma.TransactionClient, id: string, actor: Actor, sessionId: string) {
  await tx.$queryRaw`SELECT id FROM "AttendanceDeletionSnapshot" WHERE id=${id}::uuid FOR UPDATE`;
  const snapshot = await tx.attendanceDeletionSnapshot.findUnique({ where: { id } });
  if (!snapshot || snapshot.adminId !== actor.id || snapshot.sessionId !== sessionId)
    throw new HttpError(404, "النسخة الاحتياطية غير متاحة لهذه الجلسة");
  if (snapshot.consumedAt || snapshot.expiresAt.getTime() <= Date.now())
    throw new HttpError(409, "انتهت صلاحية التحديد. أعد تصدير النسخة الاحتياطية");
  return snapshot;
}
function requireExport(snapshot: AttendanceDeletionSnapshot) {
  if (!snapshot.exportedAt || !snapshot.fileHash) throw new HttpError(409, "صدّر نسخة Excel أولاً");
}
function requireReauth(snapshot: AttendanceDeletionSnapshot) {
  if (!snapshot.reauthenticatedAt || Date.now() - snapshot.reauthenticatedAt.getTime() >= REAUTH_MS)
    throw new HttpError(401, "أعد تأكيد كلمة مرور المسؤول الأعلى خلال آخر خمس دقائق");
}
type StoredRecord = ReturnType<typeof selectedDeletionRows> extends Promise<(infer R)[]> ? R : never;
export async function exportDeletionBackup(actor: Actor, sessionId: string, id: string) {
  return db.$transaction(async tx => {
    const snapshot = await lockedSnapshot(tx, id, actor, sessionId);
    const records = snapshot.records as unknown as StoredRecord[];
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("نسخة الحضور", { views: [{ rightToLeft: true }] });
    sheet.addRow(["نسخة احتياطية قبل الحذف النهائي", snapshot.id, snapshot.recordCount]);
    sheet.addRow([
      "الاسم", "الرقم الوظيفي", "البريد الوظيفي", "القسم", "الليدر المسؤول",
      "تاريخ الحضور", "وقت الحضور (بغداد)", "الحالة", "معرف سجل الحضور", "معرف الموظف",
      "معرف الليدر التاريخي", "معرف القسم التاريخي", "وقت الحضور UTC", "وقت الحضور الأصلي UTC",
      "وقت التسجيل UTC", "طريقة التسجيل", "معرف المسؤول المسجل", "سبب التعديل",
      "وقت الحذف القابل للاستعادة UTC", "وقت الإنشاء UTC", "آخر تعديل UTC",
      "رمز الشفت", "اسم الشفت", "بداية الشفت (بغداد)", "نهاية الشفت (بغداد)", "تاريخ بداية الشفت", "بداية الشفت UTC", "نهاية الشفت UTC",
    ]);
    records.forEach(r => sheet.addRow([
      r.employeeName, r.employeeNumber, r.email, r.departmentName, r.teamLeaderName,
      new Date(r.attendanceDate).toISOString().slice(0, 10),
      r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Baghdad" }) : "—",
      statusNames[r.status] || r.status, r.id, r.employeeId, r.teamLeaderId, r.historicalDepartmentId,
      r.checkInAt, r.originalCheckInAt, r.registeredAt, r.registrationMethod, r.createdByAdminId,
      r.modificationReason, r.deletedAt, r.createdAt, r.updatedAt,
      r.shiftCodeSnapshot, r.shiftNameSnapshot || "بدون شفت", r.shiftStartTimeSnapshot, r.shiftEndTimeSnapshot, r.shiftBusinessDate, r.shiftStartsAt, r.shiftEndsAt,
    ]));
    sheet.getRow(2).font = { bold: true };
    sheet.columns.forEach(c => { c.width = 28; });
    sheet.autoFilter = "A2:AB2";
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const updated = await tx.attendanceDeletionSnapshot.update({ where: { id }, data: {
      exportedAt: new Date(), fileHash: createHash("sha256").update(buffer).digest("hex"),
      codeVerifiedAt: null, reauthenticatedAt: null,
    } });
    await audit(tx, actor.id, "EXPORT_BACKUP", "AttendanceDeletionSnapshot", id, null,
      { count: snapshot.recordCount, fingerprint: snapshot.fingerprint }, "نسخة Excel قبل الحذف النهائي");
    return { buffer, receipt: exportReceipt(updated) };
  }, { timeout: 30000 });
}
export async function reauthenticateDeletion(actor: Actor, sessionId: string, id: string, password: string) {
  await rateLimit(`attendance-delete:reauth:${actor.id}`, 5, 15);
  if (!await verify(actor.passwordHash, password).catch(() => false))
    throw new HttpError(401, "كلمة المرور غير صحيحة");
  return db.$transaction(async tx => {
    const snapshot = await lockedSnapshot(tx, id, actor, sessionId);
    requireExport(snapshot);
    await tx.attendanceDeletionSnapshot.update({ where: { id }, data: { reauthenticatedAt: new Date(), codeVerifiedAt: null } });
    await audit(tx, actor.id, "REAUTHENTICATE_DELETE", "AttendanceDeletionSnapshot", id, null, null, "إعادة تأكيد هوية المسؤول الأعلى");
    return { ok: true, validForSeconds: REAUTH_MS / 1000 };
  });
}
export async function verifyDeletionCode(actor: Actor, sessionId: string, id: string, code: string) {
  await rateLimit(`attendance-delete:code:${actor.id}`, 5, 15);
  return db.$transaction(async tx => {
    const snapshot = await lockedSnapshot(tx, id, actor, sessionId);
    requireExport(snapshot); requireReauth(snapshot);
    if (!matches(snapshot.codeHash, codeHash(id, sessionId, code))) throw new HttpError(400, "رمز الحذف غير صحيح");
    await tx.attendanceDeletionSnapshot.update({ where: { id }, data: { codeVerifiedAt: new Date() } });
    return { ok: true };
  });
}
export async function permanentlyDeleteAttendance(actor: Actor, sessionId: string, input: {
  snapshotId: string; backupConfirmed: true; receipt: string; code: string; reason: string;
}) {
  await rateLimit(`attendance-delete:code:${actor.id}`, 5, 15);
  try {
    return await db.$transaction(async tx => {
      const snapshot = await lockedSnapshot(tx, input.snapshotId, actor, sessionId);
      requireExport(snapshot); requireReauth(snapshot);
      if (input.backupConfirmed !== true || !matches(exportReceipt(snapshot), input.receipt))
        throw new HttpError(400, "أكد تحميل نسخة Excel الخاصة بهذا التحديد");
      if (!snapshot.codeVerifiedAt || !matches(snapshot.codeHash, codeHash(snapshot.id, sessionId, input.code)))
        throw new HttpError(400, "يجب التحقق من رمز الحذف على الخادم أولاً");
      // Assignment writers already share this transaction lock. Attendance row
      // locks plus SERIALIZABLE prevent corrections racing the final comparison.
      await lockAssignments(tx);
      const saved = snapshot.records as unknown as StoredRecord[];
      const ids = saved.map(r => r.id);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "AttendanceRecord" WHERE id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`);
      const current = await selectedDeletionRows(tx, deletionSelection.parse(snapshot.selection));
      if (current.length !== snapshot.recordCount || fingerprint(json(current)) !== snapshot.fingerprint)
        throw new HttpError(409, "تغيرت السجلات منذ تصدير Excel. أعد التحديد والتصدير والتأكيد");
      // Keep a full audit per event, using one insert so a bulk operation does
      // not need thousands of database round trips inside the transaction.
      await tx.auditLog.createMany({ data: current.map(record => ({
        actorAdminId: actor.id, action: "PERMANENT_DELETE", entityType: "AttendanceRecord", entityId: record.id,
        oldValues: json(record), newValues: { snapshotId: snapshot.id, backupFileHash: snapshot.fileHash }, reason: input.reason,
      })) });
      const deleted = await tx.attendanceRecord.deleteMany({ where: { id: { in: ids } } });
      if (deleted.count !== snapshot.recordCount) throw new HttpError(409, "تغير عدد السجلات. لم يتم الحذف");
      await tx.attendanceDeletionSnapshot.update({ where: { id: snapshot.id }, data: { consumedAt: new Date() } });
      await audit(tx, actor.id, "PERMANENT_DELETE_BATCH", "AttendanceDeletionSnapshot", snapshot.id, null,
        { count: deleted.count, recordIds: ids, backupConfirmed: true, backupFileHash: snapshot.fileHash }, input.reason);
      return { deleted: deleted.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw new HttpError(409, "تغيرت البيانات أثناء العملية. أعد تصدير النسخة الاحتياطية");
    throw error;
  }
}
