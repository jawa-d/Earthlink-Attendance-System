import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), legacy: vi.fn(), limit: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: m.transaction } }));
vi.mock("@/lib/auth", () => ({ rateLimit: m.limit }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: m.cookie }) }));
import { POST } from "../src/app/api/attendance/route";
const employeeId = "00000000-0000-4000-8000-000000000001";
function req(body: string) { return new Request("https://synthetic.invalid/api/attendance", { method: "POST", headers: { origin: "https://synthetic.invalid", "content-type": "application/json" }, body }); }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "https://synthetic.invalid"); vi.stubEnv("AUTH_SECRET", "synthetic-test-secret".repeat(4));
  m.transaction.mockImplementation(async fn => fn({ $queryRaw: m.lock, employee: { findUnique: m.find, update: m.update }, attendanceRecord: { findFirst: m.legacy, create: m.create } }));
  m.find.mockResolvedValue({ id: employeeId, status: "ACTIVE", deletedAt: null, fullName: "Synthetic only", normalizedEmail: "synthetic@earthlink.iq" });
  m.create.mockImplementation(async ({ data }) => ({ id: "synthetic-record", ...data })); m.legacy.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("public attendance security boundaries (synthetic DB only)", () => {
  it("documents OPEN impersonation: a bare registered email creates attendance without employee identity proof", async () => {
    const response = await POST(req('{"email":"synthetic@earthlink.iq"}'));
    expect(response.status).toBe(201); expect(m.create).toHaveBeenCalledOnce();
    const result = await response.json(); expect(result.name).toBe("Synthetic only"); expect(result).not.toHaveProperty("employeeId");
    expect(result).not.toHaveProperty("passwordHash"); expect(result).not.toHaveProperty("departmentId");
  });
  it.each(["null", "[]", '{"email":"synthetic@earthlink.iq\' OR 1=1--"}', '{"email":{"$ne":null}}'])("rejects malformed/SQL or operator injection %s before queries", async body => {
    expect((await POST(req(body))).status).toBe(400); expect(m.transaction).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled();
  });
  it("binds accepted values as raw SQL parameters and ignores submitted ownership/time fields", async () => {
    const response = await POST(req(JSON.stringify({ email: "synthetic@earthlink.iq", employeeId: "another-person", now: "2099-01-01", status: "EXCUSED", role: "SUPER_ADMIN", checkInAt: "1900-01-01" })));
    expect(response.status).toBe(201);
    const [template, parameter] = m.lock.mock.calls[0]; expect(template.join("?")).not.toContain("synthetic@earthlink.iq"); expect(parameter).toBe("synthetic@earthlink.iq");
    const data = m.create.mock.calls[0][0].data; expect(data.employeeId).toBe(employeeId); expect(data.status).toBe("PRESENT"); expect(data.checkInAt.getUTCFullYear()).not.toBe(2099);
  });
  it("blocks oversized public JSON before rate-limit writes or employee lookup", async () => {
    const response = await POST(req(JSON.stringify({ email: "synthetic@earthlink.iq", extra: "x".repeat(65536) })));
    expect(response.status).toBe(413); expect(m.limit).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
});
