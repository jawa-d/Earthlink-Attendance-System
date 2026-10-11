import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  register: vi.fn(),
  limit: vi.fn(),
  cookie: vi.fn(),
  set: vi.fn(),
  find: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock("@/lib/service", () => ({ registerAttendance: m.register }));
vi.mock("@/lib/auth", () => ({ rateLimit: m.limit }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: m.cookie, set: m.set }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    employee: { findUnique: m.find },
    attendanceRecord: { findFirst: m.legacy },
  },
}));
import { POST as register } from "../src/app/api/attendance/route";
import {
  POST as status,
  DELETE as clear,
} from "../src/app/api/attendance/cooldown/route";
import { AttendanceCooldownError } from "../src/lib/attendance-cooldown";
import { encodeReceipt, decodeReceipt } from "../src/lib/attendance-receipt";
const employeeId = "38f20893-7242-4f23-a144-5026dc22e112";
function req(
  body: unknown = { email: "synthetic@earthlink.iq" },
  origin = "https://attendance.example",
) {
  return new Request("https://attendance.example/api/attendance", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", "Synthetic isolated fixture secret".repeat(3));
  vi.stubEnv("APP_URL", "https://attendance.example");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("attendance conflict privacy and receipt revalidation", () => {
  it("returns only structured cooldown timing, never employee identity", async () => {
    const times = {
      nextAllowedAt: "2026-10-12T06:00:00.000Z",
      serverNow: "2026-10-11T21:00:00.000Z",
    };
    m.register.mockRejectedValue(
      new AttendanceCooldownError(employeeId, times),
    );
    const response = await register(req());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "تم تسجيل حضورك مسبقاً",
      code: "ATTENDANCE_COOLDOWN",
      ...times,
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(m.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/attendance",
    });
  });
  it("ignores client timestamps and retains validation, Origin and rate limits", async () => {
    m.register.mockResolvedValue({ employeeId, date: "2026-10-11" });
    expect(
      (
        await register(
          req({
            email: "synthetic@earthlink.iq",
            now: "2099-01-01",
            nextAllowedAt: "1900-01-01",
          }),
        )
      ).status,
    ).toBe(201);
    expect(m.register).toHaveBeenCalledWith("synthetic@earthlink.iq");
    expect(m.limit).toHaveBeenCalledTimes(2);
    expect(
      (await register(req(undefined, "https://other.invalid"))).status,
    ).toBe(403);
    expect((await register(req({ email: "bad" }))).status).toBe(400);
  });
  it("has no arbitrary status lookup: no receipt means no database query, even with an employee body", async () => {
    expect(
      await (
        await status(req({ employeeId, email: "synthetic@earthlink.iq" }))
      ).json(),
    ).toEqual({ state: "unknown" });
    expect(m.find).not.toHaveBeenCalled();
  });
  it("rejects forged and expired encrypted receipts", () => {
    const token = encodeReceipt(employeeId, 1000);
    expect(decodeReceipt(token, 1001)?.employeeId).toBe(employeeId);
    expect(token).not.toContain(employeeId);
    expect(decodeReceipt(token.slice(0, -8) + "forgedxx", 1001)).toBeNull();
    expect(decodeReceipt(token, 1000 + 48 * 3600000)).toBeNull();
  });
  it("revalidates the current database cooldown at exactly ten hours without personal data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    m.cookie.mockReturnValue({ value: encodeReceipt(employeeId) });
    m.find.mockResolvedValue({
      status: "ACTIVE",
      deletedAt: null,
      lastSuccessfulAttendanceAt: new Date("2026-10-11T00:00:00Z"),
    });
    const ready = await (await status(req())).json();
    expect(ready).toEqual({
      state: "ready",
      nextAllowedAt: "2026-10-11T10:00:00.000Z",
      serverNow: "2026-10-11T10:00:00.000Z",
    });
    vi.setSystemTime(new Date("2026-10-11T09:59:59Z"));
    expect((await (await status(req())).json()).state).toBe("cooldown");
    m.find.mockResolvedValue({ status: "INACTIVE" });
    expect(await (await status(req())).json()).toEqual({
      state: "unavailable",
    });
  });
  it("clears only the receipt and rejects cross-origin status requests", async () => {
    expect((await status(req({}, "https://other.invalid"))).status).toBe(403);
    expect((await clear(req())).status).toBe(200);
    expect(m.set.mock.calls[0][2].maxAge).toBe(0);
    expect(m.find).not.toHaveBeenCalled();
  });
});
