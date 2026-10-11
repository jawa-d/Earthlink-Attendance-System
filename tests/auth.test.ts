import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  cookie: vi.fn(),
  session: vi.fn(),
  create: vi.fn(),
  set: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: m.cookie, set: m.set }),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    session: { findUnique: m.session, create: m.create },
    rateLimit: { upsert: m.limit },
  },
}));
import {
  currentAdmin,
  authorize,
  createSession,
  rateLimit,
} from "../src/lib/auth";
beforeEach(() => {
  vi.resetAllMocks();
  process.env.AUTH_SECRET = "q".repeat(32);
});
describe("server-side sessions", () => {
  it("returns no administrator without a cookie", async () => {
    expect(await currentAdmin()).toBeNull();
    expect(m.session).not.toHaveBeenCalled();
  });
  it.each([
    { expiresAt: new Date(0), admin: { isActive: true } },
    { expiresAt: new Date(Date.now() + 100000), admin: { isActive: false } },
  ])("rejects expired or disabled sessions", async (session) => {
    m.cookie.mockReturnValue({ value: "token" });
    m.session.mockResolvedValue(session);
    expect(await currentAdmin()).toBeNull();
    await expect(authorize()).rejects.toMatchObject({ status: 401 });
  });
  it("checks the role from the current database record", async () => {
    m.cookie.mockReturnValue({ value: "token" });
    m.session.mockResolvedValue({
      expiresAt: new Date(Date.now() + 100000),
      admin: { isActive: true, role: "VIEWER" },
    });
    await expect(authorize("write")).rejects.toMatchObject({ status: 403 });
    expect(await authorize("read")).toMatchObject({ role: "VIEWER" });
  });
  it("stores a token hash and sets HttpOnly expiring cookies", async () => {
    await createSession("admin");
    const stored = m.create.mock.calls[0][0].data;
    const cookie = m.set.mock.calls[0];
    expect(stored.id).not.toBe(cookie[1]);
    expect(cookie[2]).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      7 * 3600000,
    );
  });
  it("rejects exhausted shared database rate limits", async () => {
    m.limit.mockResolvedValue({ count: 6 });
    await expect(rateLimit("login", 5, 15)).rejects.toMatchObject({
      status: 429,
    });
    expect(m.limit).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: { increment: 1 } } }),
    );
  });
});
