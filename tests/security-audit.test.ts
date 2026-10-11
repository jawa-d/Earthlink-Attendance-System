import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { hash } from "@node-rs/argon2";
const m = vi.hoisted(() => ({
  find: vi.fn(),
  limit: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  cookie: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    adminUser: { findUnique: m.find },
    rateLimit: { upsert: m.limit },
    session: { create: m.create, deleteMany: m.revoke },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: m.cookie, set: m.set, delete: m.remove }),
}));
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
function request(
  origin = "https://audit.example",
  body: unknown = {
    email: "synthetic@example.invalid",
    password: "Synthetic test fixture only",
  },
) {
  return new Request("https://audit.example/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://audit.example");
  vi.stubEnv("AUTH_SECRET", "x".repeat(64));
  vi.stubEnv("NODE_ENV", "production");
  m.limit.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());
describe("non-destructive audit: mocked authentication route", () => {
  it("rejects wrong or absent Origin before any database operation", async () => {
    expect((await login(request("https://other.invalid"))).status).toBe(403);
    const req = request();
    req.headers.delete("origin");
    expect((await login(req)).status).toBe(403);
    expect(
      m.limit.mock.calls.length === 0 && m.find.mock.calls.length === 0,
    ).toBe(true);
  });
  it("rejects invalid request input before rate-limit database writes", async () => {
    expect(
      (await login(request(undefined, { email: "invalid", password: "" })))
        .status,
    ).toBe(400);
    expect(m.limit.mock.calls.length === 0).toBe(true);
  });
  it("rejects incorrect passwords and inactive accounts without issuing sessions", async () => {
    const stored = await hash("Synthetic test fixture only");
    m.find.mockResolvedValue({
      id: "synthetic-admin",
      isActive: true,
      passwordHash: stored,
    });
    expect(
      (
        await login(
          request(undefined, {
            email: "synthetic@example.invalid",
            password: "incorrect",
          }),
        )
      ).status,
    ).toBe(401);
    m.find.mockResolvedValue({
      id: "synthetic-admin",
      isActive: false,
      passwordHash: stored,
    });
    expect((await login(request())).status).toBe(401);
    expect(
      m.create.mock.calls.length === 0 && m.set.mock.calls.length === 0,
    ).toBe(true);
  });
  it("creates production cookies with Secure, HttpOnly and Strict attributes", async () => {
    m.find.mockResolvedValue({
      id: "synthetic-admin",
      isActive: true,
      passwordHash: await hash("Synthetic test fixture only"),
    });
    expect((await login(request())).status).toBe(200);
    const options = m.set.mock.calls[0][2];
    expect(
      options.secure === true &&
        options.httpOnly === true &&
        options.sameSite === "strict" &&
        options.path === "/",
    ).toBe(true);
    expect(m.create.mock.calls[0][0].data.id !== m.set.mock.calls[0][1]).toBe(
      true,
    );
  });
  it("denies exhausted rate limits before password verification", async () => {
    m.limit.mockResolvedValue({ count: 6 });
    expect((await login(request())).status).toBe(429);
    expect(m.find.mock.calls.length === 0).toBe(true);
  });
  it("revokes the current hashed session and removes the cookie on logout", async () => {
    m.cookie.mockReturnValue({ value: "synthetic-test-token" });
    expect((await logout(request())).status).toBe(200);
    expect(
      m.revoke.mock.calls.length === 1 && m.remove.mock.calls.length === 1,
    ).toBe(true);
    expect(m.revoke.mock.calls[0][0].where.id !== "synthetic-test-token").toBe(
      true,
    );
  });
});
