import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  find: vi.fn(),
  shift: vi.fn(),
  legacy: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  auth: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    employee: { findUnique: m.find, update: m.update },
    shift: { findUnique: m.shift },
    attendanceRecord: { findFirst: m.legacy, create: m.create },
    $queryRaw: m.query,
    auditLog: { create: m.audit },
  };
  return {
    db: {
      $transaction: async (fn: (tx: unknown) => unknown) => {
        m.transaction();
        return fn(tx);
      },
    },
  };
});
vi.mock("@/lib/auth", () => ({ authorize: m.auth, rateLimit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: m.cookie }) }));
import { registerAttendance } from "../src/lib/service";
import { POST as manual } from "../src/app/api/admin/[resource]/route";
import { PATCH as correction } from "../src/app/api/admin/[resource]/[id]/route";
import { POST as publicRegistration } from "../src/app/api/attendance/route";
const id = "00000000-0000-4000-8000-000000000001",
  dept = "00000000-0000-4000-8000-000000000002",
  employeeId = "00000000-0000-4000-8000-000000000003";
const shift = {
  id,
  code: "S02",
  name: "مسائي",
  startTime: "16:30",
  endTime: "01:00",
  isActive: true,
  departments: [{ departmentId: dept }],
};
const employee = {
  id: employeeId,
  status: "ACTIVE",
  deletedAt: null,
  fullName: "Synthetic",
  normalizedEmail: "synthetic@earthlink.iq",
  departmentId: dept,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "true");
  vi.stubEnv("APP_URL", "https://synthetic.invalid");
  vi.stubEnv("AUTH_SECRET", "synthetic-shift-receipt-secret".repeat(3));
  m.find.mockResolvedValue(employee);
  m.shift.mockResolvedValue(shift);
  m.legacy.mockResolvedValue(null);
  m.create.mockImplementation(async ({ data }) => ({
    id: "synthetic-record",
    ...data,
  }));
  m.auth.mockResolvedValue({ id: "synthetic-admin", role: "ADMIN" });
});
afterEach(() => vi.unstubAllEnvs());
describe("selected-shift attendance snapshots and unchanged cooldown", () => {
  it("writes server-derived immutable history and an overnight schedule without changing the registration date", async () => {
    const result = await registerAttendance(
      "synthetic@earthlink.iq",
      new Date("2026-10-12T21:30:00Z"),
      id,
    );
    const data = m.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      employeeId,
      shiftId: id,
      shiftCodeSnapshot: "S02",
      shiftNameSnapshot: "مسائي",
      shiftStartTimeSnapshot: "16:30",
      shiftEndTimeSnapshot: "01:00",
      attendanceDate: new Date("2026-10-13"),
      shiftBusinessDate: new Date("2026-10-12"),
      shiftStartsAt: new Date("2026-10-12T13:30:00Z"),
      shiftEndsAt: new Date("2026-10-12T22:00:00Z"),
      status: "PRESENT",
      registrationMethod: "QR",
    });
    expect(result.shiftLabel).toContain("S02 — مسائي");
    expect(m.query).toHaveBeenCalledTimes(2);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: employeeId },
      data: { lastSuccessfulAttendanceAt: new Date("2026-10-12T21:30:00Z") },
    });
  });
  it.each([undefined, null, "", "S02", "forged"])(
    "required rollout rejects missing/invalid selection %s without creating attendance",
    async (selection) => {
      await expect(
        registerAttendance("synthetic@earthlink.iq", new Date(), selection),
      ).rejects.toBeDefined();
      expect(m.create).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    { ...shift, isActive: false },
    { ...shift, departments: [{ departmentId: employeeId }] },
  ])("rejects nonexistent/inactive/disallowed shift %j", async (value) => {
    m.shift.mockResolvedValue(value);
    await expect(
      registerAttendance("synthetic@earthlink.iq", new Date(), id),
    ).rejects.toMatchObject({ status: 400 });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("allows an unrestricted shift but never changes saved snapshot history after rename/deactivation", async () => {
    m.shift.mockResolvedValue({ ...shift, departments: [] });
    await registerAttendance(
      "synthetic@earthlink.iq",
      new Date("2026-10-12T13:30:00Z"),
      id,
    );
    const saved = structuredClone(m.create.mock.calls[0][0].data);
    m.shift.mockResolvedValue({
      ...shift,
      code: "NEW",
      name: "اسم جديد",
      isActive: false,
    });
    expect(saved.shiftCodeSnapshot).toBe("S02");
    expect(saved.shiftNameSnapshot).toBe("مسائي");
  });
  it("changing the selected shift cannot bypass ten-hour cooldown; exact boundary still succeeds", async () => {
    const last = new Date("2026-10-12T00:00:00Z");
    m.find.mockResolvedValue({ ...employee, lastSuccessfulAttendanceAt: last });
    await expect(
      registerAttendance(
        "synthetic@earthlink.iq",
        new Date(last.getTime() + 35_999_999),
        id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(m.shift).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    await registerAttendance(
      "synthetic@earthlink.iq",
      new Date(last.getTime() + 36_000_000),
      id,
    );
    expect(m.create).toHaveBeenCalledOnce();
  });
  it("disabled rollout preserves legacy email-only registrations without making up shift snapshots", async () => {
    vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "false");
    await registerAttendance("synthetic@earthlink.iq");
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("shiftId");
    expect(m.shift).not.toHaveBeenCalled();
  });
  it("manual attendance requires a shift after rollout and saves audited history", async () => {
    const body = {
      employeeId,
      attendanceDate: "2026-10-12",
      status: "ABSENT",
      reason: "synthetic manual attendance",
    };
    const req = (data: unknown) =>
      new Request("https://synthetic.invalid/api/admin/attendance", {
        method: "POST",
        headers: {
          origin: "https://synthetic.invalid",
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      });
    const ctx = { params: Promise.resolve({ resource: "attendance" }) };
    expect((await manual(req(body), ctx)).status).toBe(400);
    expect((await manual(req({ ...body, shiftId: id }), ctx)).status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      shiftId: id,
      status: "ABSENT",
      checkInAt: null,
      shiftBusinessDate: new Date("2026-10-12"),
    });
    expect(m.audit).toHaveBeenCalled();
  });
  it("does not accept client time/code/name snapshots through the public service selection", async () => {
    await expect(
      registerAttendance("synthetic@earthlink.iq", new Date(), {
        code: "S02",
        shiftId: id,
        name: "forged",
      }),
    ).rejects.toBeDefined();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("public API ignores forged employee/department/status/time/snapshot fields and uses server data", async () => {
    const response = await publicRegistration(
      new Request("https://synthetic.invalid/api/attendance", {
        method: "POST",
        headers: {
          origin: "https://synthetic.invalid",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "synthetic@earthlink.iq",
          shiftId: id,
          employeeId: dept,
          departmentId: "forged",
          shiftCode: "FORGED",
          shiftCodeSnapshot: "FORGED",
          shiftNameSnapshot: "forged",
          startTime: "00:00",
          now: "2099-01-01",
          status: "EXCUSED",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      employeeId,
      shiftCodeSnapshot: "S02",
      shiftNameSnapshot: "مسائي",
      status: "PRESENT",
    });
    expect(
      m.create.mock.calls[0][0].data.registeredAt.getUTCFullYear(),
    ).not.toBe(2099);
  });
  it("preserves an old record's snapshot by rejecting a submitted shift reassignment", async () => {
    // The route rejects before performing the employee move or attendance write.
    const tx = {
      $queryRaw: m.query,
      attendanceRecord: {
        findUnique: async () => ({
          id: employeeId,
          deletedAt: null,
          shiftId: id,
        }),
      },
    };
    const databaseModule = await import("../src/lib/db");
    vi.spyOn(databaseModule.db, "$transaction").mockImplementationOnce(
      async (fn: unknown) => (fn as (tx: unknown) => Promise<unknown>)(tx),
    );
    const response = await correction(
      new Request(
        `https://synthetic.invalid/api/admin/attendance/${employeeId}`,
        {
          method: "PATCH",
          headers: {
            origin: "https://synthetic.invalid",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            employeeId,
            shiftId: dept,
            attendanceDate: "2026-10-12",
            status: "LATE",
            reason: "synthetic reassignment",
          }),
        },
      ),
      { params: Promise.resolve({ resource: "attendance", id: employeeId }) },
    );
    expect(response.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
});
