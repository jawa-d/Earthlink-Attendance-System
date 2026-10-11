import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  employee: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: m.query,
        attendanceRecord: { findUnique: m.find, update: m.update },
        employee: { findUnique: m.employee },
      }),
  },
}));
vi.mock("@/lib/service", () => ({ audit: m.audit }));
import { PATCH, DELETE } from "../src/app/api/admin/[resource]/[id]/route";
import { HttpError } from "../src/lib/http";
const id = "38f20893-7242-4f23-a144-5026dc22e112";
const employeeId = "fb11dd16-37b2-4053-bf49-d13a0476f158";
const ctx = { params: Promise.resolve({ resource: "attendance", id }) };
function request(method: string, body: unknown) {
  return new Request(
    `https://attendance.example.com/api/admin/attendance/${id}`,
    {
      method,
      headers: {
        origin: "https://attendance.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = "https://attendance.example.com";
  m.authorize.mockResolvedValue({ id: "admin", role: "ADMIN" });
  m.employee.mockResolvedValue({ id: employeeId, deletedAt: null });
  m.find.mockResolvedValue({
    id,
    employeeId,
    status: "PRESENT",
    attendanceDate: new Date("2026-10-11"),
    checkInAt: new Date("2026-10-11T05:00:43Z"),
    originalCheckInAt: new Date("2026-10-11T05:00:43Z"),
    deletedAt: null,
  });
  m.update.mockImplementation(async ({ data }) => ({ id, ...data }));
});
describe("administrative attendance routes", () => {
  it("rejects unauthenticated mutations before database writes", async () => {
    m.authorize.mockRejectedValue(new HttpError(401, "login required"));
    const response = await PATCH(
      request("PATCH", { reason: "valid reason" }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects viewers", async () => {
    m.authorize.mockRejectedValue(new HttpError(403, "forbidden"));
    const response = await DELETE(
      request("DELETE", { reason: "valid reason" }),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("preserves precise timestamps on status-only corrections and audits", async () => {
    const response = await PATCH(
      request("PATCH", {
        employeeId,
        attendanceDate: "2026-10-11",
        status: "LATE",
        reason: "approved correction",
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const data = m.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("checkInAt");
    expect(data).not.toHaveProperty("originalCheckInAt");
    expect(data.status).toBe("LATE");
    expect(m.audit).toHaveBeenCalledWith(
      expect.anything(),
      "admin",
      "UPDATE",
      "AttendanceRecord",
      id,
      expect.anything(),
      expect.anything(),
      "approved correction",
    );
  });
  it("rejects changes without a reason", async () => {
    const response = await PATCH(
      request("PATCH", {
        employeeId,
        attendanceDate: "2026-10-11",
        status: "LATE",
        reason: "",
      }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("soft-deletes and audits instead of destroying history", async () => {
    const response = await DELETE(
      request("DELETE", { reason: "approved removal" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(m.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(m.audit).toHaveBeenCalled();
  });
  it("reserves restoration for super administrators", async () => {
    const response = await PATCH(
      request("PATCH", { restore: true, reason: "approved restore" }),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
    m.authorize.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
    const allowed = await PATCH(
      request("PATCH", { restore: true, reason: "approved restore" }),
      ctx,
    );
    expect(allowed.status).toBe(200);
    expect(m.update.mock.calls[0][0].data.deletedAt).toBeNull();
  });
});
