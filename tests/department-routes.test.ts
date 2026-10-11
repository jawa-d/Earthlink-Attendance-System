import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/db", () => ({
  db: {
    department: { findMany: m.list },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        department: { create: m.create, findUnique: m.find, update: m.update },
      }),
  },
}));
vi.mock("@/lib/service", () => ({ audit: m.audit }));
import { GET, POST } from "../src/app/api/admin/[resource]/route";
import { PATCH, DELETE } from "../src/app/api/admin/[resource]/[id]/route";
import { HttpError } from "../src/lib/http";
const id = "38f20893-7242-4f23-a144-5026dc22e112";
const ctx = { params: Promise.resolve({ resource: "departments", id }) };
const payload = {
  name: "مركز الاتصال",
  code: "call_center",
  englishName: "Call Center",
  reason: "Approved department change",
};
function request(method: string, data = payload) {
  return new Request("https://attendance.example.com/api/admin/departments", {
    method,
    headers: {
      origin: "https://attendance.example.com",
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(data),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = "https://attendance.example.com";
  m.authorize.mockImplementation(async (access) => {
    if (access === "super") return { id: "admin", role: "SUPER_ADMIN" };
    return { id: "viewer", role: "VIEWER" };
  });
  m.create.mockImplementation(async ({ data }) => ({ id, ...data }));
  m.find.mockResolvedValue({ id, ...payload, isActive: true });
  m.update.mockImplementation(async ({ data }) => ({ id, ...data }));
  m.list.mockResolvedValue([
    { id, name: payload.name, _count: { employees: 2 } },
  ]);
});
describe("department API", () => {
  it("lists departments for read roles with counts and active filters", async () => {
    const r = await GET(
      new Request(
        "https://attendance.example.com/api/admin/departments?active=true&q=CALL",
      ),
      ctx,
    );
    expect(r.status).toBe(200);
    expect(m.authorize).toHaveBeenCalledWith("read");
    expect(m.list.mock.calls[0][0]).toMatchObject({
      where: { isActive: true },
      include: { _count: { select: { employees: true } } },
    });
    expect((await r.json())[0]._count.employees).toBe(2);
  });
  it("creates normalized departments and records an audit", async () => {
    expect((await POST(request("POST"), ctx)).status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      code: "CALL_CENTER",
      isActive: true,
    });
    expect(m.audit).toHaveBeenCalled();
    expect(m.authorize).toHaveBeenCalledWith("super");
  });
  it("validates required codes before writing", async () => {
    expect(
      (await POST(request("POST", { ...payload, code: "" }), ctx)).status,
    ).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("returns conflict for duplicate codes without auditing", async () => {
    m.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6",
      }),
    );
    expect((await POST(request("POST"), ctx)).status).toBe(409);
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([401, 403])("denies unauthorized mutations (%s)", async (status) => {
    m.authorize.mockRejectedValue(new HttpError(status, "denied"));
    expect((await POST(request("POST"), ctx)).status).toBe(status);
    expect((await PATCH(request("PATCH"), ctx)).status).toBe(status);
    expect((await DELETE(request("DELETE"), ctx)).status).toBe(status);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("edits metadata and allows audited deactivation of legacy departments", async () => {
    expect((await PATCH(request("PATCH"), ctx)).status).toBe(200);
    expect(
      (
        await PATCH(
          request("PATCH", { ...payload, isActive: false } as typeof payload),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(m.update.mock.calls[1][0].data.isActive).toBe(false);
    expect(m.audit).toHaveBeenCalledTimes(2);
  });
  it("prevents physical deletion even when employee history is linked", async () => {
    expect((await DELETE(request("DELETE"), ctx)).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
});
