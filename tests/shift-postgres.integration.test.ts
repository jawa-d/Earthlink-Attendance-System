import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const target = process.env.SHIFT_TEST_DATABASE_URL;
if (target && process.env.SHIFT_TEST_DATABASE_ACK !== "isolated-synthetic-only")
  throw new Error(
    "Refusing shift integration without explicit isolated-synthetic-only acknowledgement.",
  );
if (target) {
  const test = new URL(target);
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const value = process.env[key];
    if (!value) continue;
    const app = new URL(value);
    if (
      test.hostname.replace("-pooler.", ".") ===
        app.hostname.replace("-pooler.", ".") &&
      test.pathname === app.pathname
    )
      throw new Error(
        "Refusing shift integration against the application database.",
      );
  }
}
describe.skipIf(!target)(
  "shifts on an explicitly isolated, migrated PostgreSQL database",
  () => {
    it("runs authorized CRUD, overnight registration, snapshots, filters, exports and legacy preservation", async () => {
      const client = new PrismaClient({ datasourceUrl: target!, log: [] });
      const jar = new Map<string, { value: string }>();
      vi.doMock("@/lib/db", () => ({ db: client }));
      vi.doMock("next/headers", () => ({
        cookies: async () => ({
          get: (name: string) => jar.get(name),
          set: (name: string, value: string) => jar.set(name, { value }),
          delete: (name: string) => jar.delete(name),
        }),
      }));
      const oldGate = process.env.ATTENDANCE_SHIFTS_ENABLED,
        oldOrigin = process.env.APP_URL,
        oldSecret = process.env.AUTH_SECRET;
      process.env.AUTH_SECRET =
        "synthetic-isolated-shift-secret-0123456789-0123456789";
      process.env.APP_URL = "https://synthetic.invalid";
      const suffix = randomUUID(),
        departmentId = randomUUID(),
        employeeId = randomUUID(),
        adminId = randomUUID();
      let shiftId: string | undefined;
      try {
        await client.department.create({
          data: { id: departmentId, name: `Shift fixture ${suffix}` },
        });
        await client.employee.create({
          data: {
            id: employeeId,
            employeeNumber: suffix,
            fullName: "Synthetic shift employee",
            normalizedEmail: `${suffix}@earthlink.iq`,
            departmentId,
            createdAt: new Date("2026-10-01"),
          },
        });
        await client.adminUser.create({
          data: {
            id: adminId,
            name: "Synthetic shift admin",
            email: `${suffix}@example.invalid`,
            role: "SUPER_ADMIN",
            passwordHash: "not-a-usable-login-hash",
          },
        });
        const { createSession } = await import("../src/lib/auth");
        await createSession(adminId);
        const { POST: create } =
          await import("../src/app/api/admin/shifts/route");
        const { PATCH: edit } =
          await import("../src/app/api/admin/shifts/[id]/route");
        const request = (method: string, body: unknown) =>
          new Request("https://synthetic.invalid/api/admin/shifts", {
            method,
            headers: {
              origin: "https://synthetic.invalid",
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          });
        const created = await create(
          request("POST", {
            code: `T${suffix.slice(0, 12)}`,
            name: "مسائي تجريبي",
            startTime: "16:30",
            endTime: "01:00",
            departmentIds: [departmentId],
            reason: "Isolated fixture setup",
          }),
        );
        expect(created.status).toBe(201);
        const definition = await created.json();
        shiftId = definition.id;
        const { registerAttendance } = await import("../src/lib/service");
        process.env.ATTENDANCE_SHIFTS_ENABLED = "false";
        await registerAttendance(
          `${suffix}@earthlink.iq`,
          new Date("2026-10-09T10:30:00Z"),
        );
        process.env.ATTENDANCE_SHIFTS_ENABLED = "true";
        const at = new Date("2026-10-10T21:30:00Z");
        const registered = await registerAttendance(
          `${suffix}@earthlink.iq`,
          at,
          shiftId,
        );
        expect(registered.date).toBe("2026-10-11");
        await expect(
          registerAttendance(
            `${suffix}@earthlink.iq`,
            new Date(at.getTime() + 1000),
            shiftId,
          ),
        ).rejects.toMatchObject({ status: 409 });
        const stored = await client.attendanceRecord.findFirstOrThrow({
          where: { employeeId, shiftId },
        });
        expect(stored.shiftBusinessDate?.toISOString().slice(0, 10)).toBe(
          "2026-10-10",
        );
        expect(stored.shiftEndsAt?.toISOString()).toBe(
          "2026-10-10T22:00:00.000Z",
        );
        const context = { params: Promise.resolve({ id: shiftId! }) };
        expect(
          (
            await edit(
              request("PATCH", {
                name: "اسم معدل تجريبي",
                isActive: false,
                reason: "Isolated fixture deactivate",
              }),
              context,
            )
          ).status,
        ).toBe(200);
        const preserved = await client.attendanceRecord.findUniqueOrThrow({
          where: { id: stored.id },
        });
        expect(preserved.shiftNameSnapshot).toBe("مسائي تجريبي");
        await expect(
          registerAttendance(
            `${suffix}@earthlink.iq`,
            new Date(at.getTime() + 36_000_000),
            shiftId,
          ),
        ).rejects.toMatchObject({ status: 400 });
        const { getAttendanceList } =
          await import("../src/lib/attendance-list");
        const params = new URLSearchParams({
          start: "2026-10-09",
          end: "2026-10-11",
          employee: employeeId,
        });
        expect((await getAttendanceList(params)).total).toBe(2);
        params.set("shift", shiftId!);
        expect((await getAttendanceList(params)).total).toBe(1);
        params.set("shift", "none");
        expect((await getAttendanceList(params)).total).toBe(1);
        const { GET: exportRows } =
          await import("../src/app/api/admin/export/route");
        for (const format of ["xlsx", "pdf"]) {
          const response = await exportRows(
            new Request(
              `https://synthetic.invalid/api/admin/export?kind=attendance&format=${format}&${params}`,
            ),
          );
          expect(response.status).toBe(200);
          expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(
            100,
          );
        }
        expect(
          await client.auditLog.count({
            where: { actorAdminId: adminId, entityType: "Shift" },
          }),
        ).toBe(2);
      } finally {
        // Only fixture IDs on the explicitly acknowledged isolated DB are removed.
        await client.attendanceRecord.deleteMany({ where: { employeeId } });
        await client.employee.deleteMany({ where: { id: employeeId } });
        if (shiftId) {
          await client.shiftDepartment.deleteMany({ where: { shiftId } });
          await client.shift.deleteMany({ where: { id: shiftId } });
        }
        await client.auditLog.deleteMany({ where: { actorAdminId: adminId } });
        await client.session.deleteMany({ where: { adminId } });
        await client.adminUser.deleteMany({ where: { id: adminId } });
        await client.department.deleteMany({ where: { id: departmentId } });
        await client.$disconnect();
        for (const [key, previous] of [
          ["ATTENDANCE_SHIFTS_ENABLED", oldGate],
          ["APP_URL", oldOrigin],
          ["AUTH_SECRET", oldSecret],
        ] as const) {
          if (previous === undefined) delete process.env[key];
          else process.env[key] = previous;
        }
      }
    }, 120000);
  },
);
