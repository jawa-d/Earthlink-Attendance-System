import "dotenv/config";
import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
// Requires an isolated, already migrated PostgreSQL database. Never production.
const configured = !!process.env.TEST_DATABASE_URL;
if (configured) {
  const test = new URL(process.env.TEST_DATABASE_URL!);
  const production = new URL(process.env.DATABASE_URL!);
  if (
    test.hostname.replace("-pooler.", ".") ===
      production.hostname.replace("-pooler.", ".") &&
    test.pathname === production.pathname
  )
    throw new Error(
      "Refusing database integration tests against the application database. Use an isolated test database.",
    );
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
describe.skipIf(!configured)(
  "PostgreSQL concurrency and audit transactions",
  () => {
    it("serializes concurrent QR requests and preserves rolling cooldown through corrections/deletion", async () => {
      const { db } = await import("../src/lib/db");
      const { registerAttendance, audit } = await import("../src/lib/service");
      const suffix = randomUUID();
      const department = await db.department.create({
        data: { name: `Integration ${suffix}` },
      });
      const employee = await db.employee.create({
        data: {
          employeeNumber: suffix,
          fullName: "Integration Test",
          normalizedEmail: `test-${suffix}@earthlink.iq`,
          departmentId: department.id,
        },
      });
      const admin = await db.adminUser.create({
        data: {
          name: "Integration Admin",
          email: `${suffix}@example.test`,
          passwordHash: "not-a-usable-password",
          role: "SUPER_ADMIN",
        },
      });
      try {
        const now = new Date("2026-10-11T00:00:00Z");
        const results = await Promise.allSettled(
          Array.from({ length: 12 }, () =>
            registerAttendance(employee.normalizedEmail, now),
          ),
        );
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toHaveLength(11);
        const record = await db.attendanceRecord.findFirstOrThrow({
          where: { employeeId: employee.id },
        });
        await db.$transaction(async (tx) => {
          const updated = await tx.attendanceRecord.update({
            where: { id: record.id },
            data: { status: "LATE" },
          });
          await audit(
            tx,
            admin.id,
            "UPDATE",
            "AttendanceRecord",
            record.id,
            record,
            updated,
            "Integration status correction",
          );
        });
        const changed = await db.attendanceRecord.findUniqueOrThrow({
          where: { id: record.id },
        });
        expect(changed.originalCheckInAt).toEqual(record.checkInAt);
        expect(changed.checkInAt).toEqual(record.checkInAt);
        expect(
          await db.auditLog.count({ where: { entityId: record.id } }),
        ).toBe(1);
        await db.$transaction(async (tx) => {
          const deleted = await tx.attendanceRecord.update({
            where: { id: record.id },
            data: { deletedAt: new Date() },
          });
          await audit(
            tx,
            admin.id,
            "DELETE",
            "AttendanceRecord",
            record.id,
            changed,
            deleted,
            "Integration soft delete",
          );
        });
        await expect(
          registerAttendance(
            employee.normalizedEmail,
            new Date(now.getTime() + 35_999_000),
          ),
        ).rejects.toMatchObject({ status: 409 });
        const second = await registerAttendance(
          employee.normalizedEmail,
          new Date(now.getTime() + 36_000_000),
        );
        expect(second.date).toBe("2026-10-11");
        expect(
          await db.attendanceRecord.count({
            where: { employeeId: employee.id, deletedAt: null },
          }),
        ).toBe(1);
        await db.attendanceRecord.update({
          where: { id: record.id },
          data: { deletedAt: null },
        });
        expect(
          await db.attendanceRecord.count({
            where: { employeeId: employee.id, deletedAt: null },
          }),
        ).toBe(2);
        await db.attendanceRecord.create({
          data: {
            employeeId: employee.id,
            attendanceDate: new Date("2026-10-11T00:00:00Z"),
            checkInAt: now,
            registrationMethod: "ADMIN",
            status: "PRESENT",
          },
        });
        await expect(
          registerAttendance(
            employee.normalizedEmail,
            new Date(now.getTime() + 36_001_000),
          ),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          (await db.employee.findUniqueOrThrow({ where: { id: employee.id } }))
            .lastSuccessfulAttendanceAt,
        ).toEqual(new Date(now.getTime() + 36_000_000));
      } finally {
        await db.auditLog.deleteMany({ where: { actorAdminId: admin.id } });
        await db.attendanceRecord.deleteMany({
          where: { employeeId: employee.id },
        });
        await db.employee.delete({ where: { id: employee.id } });
        await db.department.delete({ where: { id: department.id } });
        await db.adminUser.delete({ where: { id: admin.id } });
      }
    });
    afterAll(async () => {
      const { db } = await import("../src/lib/db");
      await db.$disconnect();
    });
  },
);
