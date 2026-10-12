import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ cookie: vi.fn(), session: vi.fn(), transaction: vi.fn(), query: vi.fn(), limit: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookie, set: m.set }) }));
vi.mock("@/lib/db", () => ({ db: {
  session: { findUnique: m.session }, $transaction: m.transaction,
  rateLimit: { upsert: m.limit }, employee: { findMany: m.query },
  department: { findMany: m.query }, teamLeader: { findMany: m.query },
  adminUser: { findMany: m.query }, systemSetting: { findMany: m.query },
  auditLog: { findMany: m.query, count: m.query },
} }));
import * as collection from "../src/app/api/admin/[resource]/route";
import * as item from "../src/app/api/admin/[resource]/[id]/route";
import * as leaders from "../src/app/api/admin/team-leaders/route";
import * as leader from "../src/app/api/admin/team-leaders/[id]/route";
import * as reassign from "../src/app/api/admin/team-leaders/[id]/reassign/route";
import * as report from "../src/app/api/admin/team-leader-reports/route";
import * as exporting from "../src/app/api/admin/export/route";
import * as qr from "../src/app/api/admin/qr/route";
import * as deleting from "../src/app/api/admin/attendance-deletion/route";
import * as shifts from "../src/app/api/admin/shifts/route";
import * as shift from "../src/app/api/admin/shifts/[id]/route";

const id = "00000000-0000-4000-8000-000000000001";
type Endpoint = { name: string; method: string; access: "read" | "write" | "super"; invoke: (req: Request) => Promise<Response> };
const endpoints: Endpoint[] = [];
for (const resource of ["profile", "history", "departments", "settings", "admins", "audit-logs", "employees", "attendance", "reports", "dashboard"]) {
  const ctx = { params: Promise.resolve({ resource }) };
  endpoints.push({ name: `/api/admin/${resource}`, method: "GET", access: ["settings", "admins", "audit-logs"].includes(resource) ? "super" : "read", invoke: req => collection.GET(req, ctx) });
}
for (const resource of ["employees", "attendance", "departments", "settings", "admins"]) {
  endpoints.push({ name: `/api/admin/${resource}`, method: "POST", access: ["departments", "settings", "admins"].includes(resource) ? "super" : "write", invoke: req => collection.POST(req, { params: Promise.resolve({ resource }) }) });
}
for (const resource of ["employees", "attendance", "departments", "admins"]) {
  endpoints.push({ name: `/api/admin/${resource}/${id}`, method: "PATCH", access: ["departments", "admins"].includes(resource) ? "super" : "write", invoke: req => item.PATCH(req, { params: Promise.resolve({ resource, id }) }) });
}
for (const resource of ["employees", "attendance", "departments"]) {
  endpoints.push({ name: `/api/admin/${resource}/${id}`, method: "DELETE", access: resource === "departments" ? "super" : "write", invoke: req => item.DELETE(req, { params: Promise.resolve({ resource, id }) }) });
}
endpoints.push(
  { name: "/api/admin/shifts", method: "GET", access: "read", invoke: shifts.GET },
  { name: "/api/admin/shifts", method: "POST", access: "write", invoke: shifts.POST },
  { name: `/api/admin/shifts/${id}`, method: "PATCH", access: "write", invoke: req => shift.PATCH(req, { params: Promise.resolve({ id }) }) },
  { name: `/api/admin/shifts/${id}`, method: "DELETE", access: "write", invoke: shift.DELETE },
  { name: "/api/admin/team-leaders", method: "GET", access: "read", invoke: leaders.GET },
  { name: "/api/admin/team-leaders", method: "POST", access: "write", invoke: leaders.POST },
  { name: `/api/admin/team-leaders/${id}`, method: "PATCH", access: "write", invoke: req => leader.PATCH(req, { params: Promise.resolve({ id }) }) },
  { name: `/api/admin/team-leaders/${id}`, method: "DELETE", access: "write", invoke: leader.DELETE },
  { name: `/api/admin/team-leaders/${id}/reassign`, method: "POST", access: "write", invoke: req => reassign.POST(req, { params: Promise.resolve({ id }) }) },
  { name: "/api/admin/team-leader-reports", method: "GET", access: "read", invoke: report.GET },
  { name: "/api/admin/export", method: "GET", access: "read", invoke: exporting.GET },
  { name: "/api/admin/export", method: "POST", access: "write", invoke: exporting.POST },
  { name: "/api/admin/qr", method: "GET", access: "write", invoke: qr.GET },
  { name: "/api/admin/attendance-deletion", method: "POST", access: "super", invoke: deleting.POST },
  { name: "/api/admin/attendance-deletion", method: "DELETE", access: "super", invoke: deleting.DELETE },
);
function request(endpoint: Endpoint, origin = "https://synthetic.invalid") {
  return new Request(`https://synthetic.invalid${endpoint.name}`, { method: endpoint.method, headers: { origin, "content-type": "application/json" }, ...(endpoint.method !== "GET" ? { body: '{"reason":"synthetic security test","role":"SUPER_ADMIN"}' } : {}) });
}
function session(role: "VIEWER" | "ADMIN" | "SUPER_ADMIN", expiresAt = new Date(Date.now() + 60000)) {
  m.cookie.mockReturnValue({ value: "synthetic-session-token" });
  m.session.mockResolvedValue({ expiresAt, admin: { id, isActive: true, role, name: "Synthetic", email: "synthetic@example.invalid", passwordHash: "must-never-return" } });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "https://synthetic.invalid"); vi.stubEnv("AUTH_SECRET", "synthetic test secret ".repeat(4));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("real server authorization at every administrative handler boundary (mocked DB)", () => {
  it.each(endpoints)("anonymous $method $name is denied before business database access", async endpoint => {
    const response = await endpoint.invoke(request(endpoint));
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(m.transaction).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  });
  it.each(endpoints.filter(e => e.access !== "read"))("VIEWER cannot escalate through $method $name", async endpoint => {
    session("VIEWER"); const response = await endpoint.invoke(request(endpoint));
    expect(response.status).toBe(403); expect(m.transaction).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  });
  it.each(endpoints.filter(e => e.access === "super"))("ADMIN cannot perform SUPER_ADMIN $method $name", async endpoint => {
    session("ADMIN"); expect((await endpoint.invoke(request(endpoint))).status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  });
  it.each(endpoints.filter(e => e.method !== "GET"))("CSRF denied before session lookup: $method $name", async endpoint => {
    session("SUPER_ADMIN"); expect((await endpoint.invoke(request(endpoint, "https://attacker.invalid"))).status).toBe(403);
    expect(m.session).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid", "expired", "disabled"])("%s sessions cannot disclose employee records", async kind => {
    if (kind !== "missing") session("SUPER_ADMIN", kind === "expired" ? new Date(0) : undefined);
    if (kind === "invalid") m.session.mockResolvedValue(null);
    if (kind === "disabled") m.session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), admin: { isActive: false } });
    expect((await endpoints[6].invoke(request(endpoints[6]))).status).toBe(401); expect(m.query).not.toHaveBeenCalled();
  });
  it("profile identity is always the session's administrator and excludes hashes", async () => {
    session("VIEWER"); const endpoint = endpoints[0];
    const req = new Request(`https://synthetic.invalid${endpoint.name}?id=another-admin&role=SUPER_ADMIN`);
    const response = await endpoint.invoke(req); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id, name: "Synthetic", email: "synthetic@example.invalid", role: "VIEWER" });
  });
  it("documents OPEN step-up gap: a SUPER_ADMIN session can create another administrator without its current password", async () => {
    session("SUPER_ADMIN");
    const create = vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", name: "Synthetic new admin", email: "new@example.invalid", role: "SUPER_ADMIN" });
    m.transaction.mockImplementation(async fn => fn({ adminUser: { create }, auditLog: { create: vi.fn() } }));
    const req = new Request("https://synthetic.invalid/api/admin/admins", { method: "POST", headers: { origin: "https://synthetic.invalid", "content-type": "application/json" }, body: JSON.stringify({ name: "Synthetic new admin", email: "new@example.invalid", password: "Synthetic new account password", role: "SUPER_ADMIN", reason: "synthetic audit test" }) });
    const response = await collection.POST(req, { params: Promise.resolve({ resource: "admins" }) });
    expect(response.status).toBe(201); expect(create).toHaveBeenCalledOnce();
    expect(await response.json()).not.toHaveProperty("passwordHash");
  });
  it.each(["POST", "PATCH", "DELETE"])("no %s audit-log mutation endpoint exists even for SUPER_ADMIN", async method => {
    session("SUPER_ADMIN"); m.transaction.mockImplementation(async fn => fn({}));
    const req = new Request(`https://synthetic.invalid/api/admin/audit-logs/${id}`, { method, headers: { origin: "https://synthetic.invalid", "content-type": "application/json" }, body: '{"reason":"synthetic audit test"}' });
    const response = method === "POST" ? await collection.POST(req, { params: Promise.resolve({ resource: "audit-logs" }) })
      : method === "PATCH" ? await item.PATCH(req, { params: Promise.resolve({ resource: "audit-logs", id }) })
      : await item.DELETE(req, { params: Promise.resolve({ resource: "audit-logs", id }) });
    expect(response.status).toBe(404);
  });
});
