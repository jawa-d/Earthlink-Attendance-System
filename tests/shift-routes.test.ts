import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  find: vi.fn(),
  many: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  department: vi.fn(),
  query: vi.fn(),
  employee: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.auth, rateLimit: m.rate }));
vi.mock("@/lib/service", () => ({ audit: m.audit }));
vi.mock("@/lib/db", () => {
  const tx = {
    shift: {
      findUnique: m.find,
      findMany: m.many,
      count: m.count,
      create: m.create,
      update: m.update,
    },
    department: { count: m.department },
    employee: { findUnique: m.employee },
    $queryRaw: m.query,
  };
  return {
    db: {
      ...tx,
      $transaction: async (value: unknown) =>
        typeof value === "function"
          ? value(tx)
          : Promise.all(value as Promise<unknown>[]),
    },
  };
});
import { GET, POST } from "../src/app/api/admin/shifts/route";
import { PATCH, DELETE } from "../src/app/api/admin/shifts/[id]/route";
import {
  GET as config,
  POST as choices,
} from "../src/app/api/attendance/shifts/route";
import { HttpError } from "../src/lib/http";
const id = "00000000-0000-4000-8000-000000000001",
  dept = "00000000-0000-4000-8000-000000000002";
const row = {
  id,
  code: "S02",
  name: "مسائي",
  startTime: "16:30",
  endTime: "01:00",
  isActive: true,
  departments: [],
};
const ctx = { params: Promise.resolve({ id }) };
function req(
  method: string,
  body: unknown = {},
  origin = "https://synthetic.invalid",
) {
  return new Request("https://synthetic.invalid/api/admin/shifts", {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://synthetic.invalid");
  vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "true");
  m.auth.mockResolvedValue({ id: "synthetic-admin", role: "ADMIN" });
  m.find.mockResolvedValue(row);
  m.many.mockResolvedValue([row]);
  m.count.mockResolvedValue(1);
  m.department.mockResolvedValue(1);
  m.create.mockImplementation(async ({ data }) => ({ ...row, ...data }));
  m.update.mockImplementation(async ({ data }) => ({ ...row, ...data }));
  m.employee.mockResolvedValue({
    departmentId: dept,
    status: "ACTIVE",
    deletedAt: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("shift management routes (mocked DB)", () => {
  it("creates an audited shift with a normalized unique code and department restrictions", async () => {
    const response = await POST(
      req("POST", {
        code: "s02",
        name: "مسائي",
        startTime: "16:30",
        endTime: "01:00",
        departmentIds: [dept],
        reason: "synthetic shift setup",
      }),
    );
    expect(response.status).toBe(201);
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      code: "S02",
      departments: { create: [{ departmentId: dept }] },
    });
    expect(m.audit).toHaveBeenCalledWith(
      expect.anything(),
      "synthetic-admin",
      "CREATE",
      "Shift",
      id,
      null,
      expect.anything(),
      "synthetic shift setup",
    );
    expect(m.rate).toHaveBeenCalled();
  });
  it("edits names/times and replaces restrictions without touching attendance", async () => {
    expect(
      (
        await PATCH(
          req("PATCH", {
            name: "اسم جديد",
            startTime: "17:00",
            departmentIds: [],
            reason: "synthetic correction",
          }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(m.update.mock.calls[0][0].data).toMatchObject({
      name: "اسم جديد",
      startTime: "17:00",
      departments: { deleteMany: {}, create: [] },
    });
    expect(m.query).toHaveBeenCalled();
  });
  it("deactivates rather than deleting and records the action", async () => {
    expect(
      (
        await PATCH(
          req("PATCH", { isActive: false, reason: "synthetic deactivate" }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(m.audit.mock.calls[0][2]).toBe("DEACTIVATE");
    expect((await DELETE(req("DELETE"))).status).toBe(409);
  });
  it("returns 409 for duplicate shift codes", async () => {
    m.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Synthetic duplicate", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    expect(
      (
        await POST(
          req("POST", {
            ...row,
            id: undefined,
            departments: undefined,
            reason: "synthetic duplicate",
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("validates department existence, shift IDs, time formats and reasons", async () => {
    m.department.mockResolvedValue(0);
    expect(
      (
        await POST(
          req("POST", {
            code: "S01",
            name: "نهاري",
            startTime: "08:00",
            endTime: "16:00",
            departmentIds: [dept],
            reason: "synthetic departments",
          }),
        )
      ).status,
    ).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
    expect(
      (
        await PATCH(
          req("PATCH", { startTime: "99:00", reason: "synthetic invalid" }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect((await PATCH(req("PATCH", { isActive: false }), ctx)).status).toBe(
      400,
    );
    expect(
      (
        await PATCH(req("PATCH", { isActive: false, reason: "synthetic" }), {
          params: Promise.resolve({ id: "forged" }),
        })
      ).status,
    ).toBe(400);
    m.find.mockResolvedValue(null);
    expect(
      (await PATCH(req("PATCH", { isActive: false, reason: "synthetic" }), ctx))
        .status,
    ).toBe(404);
  });
  it("supports paginated search/status/department filters and viewer read", async () => {
    m.auth.mockResolvedValue({ id: "viewer", role: "VIEWER" });
    const result = await GET(
      new Request(
        `https://synthetic.invalid/api/admin/shifts?q=مسائي&active=true&department=${dept}&page=2`,
      ),
    );
    expect(result.status).toBe(200);
    expect(m.auth).toHaveBeenCalledWith("read");
    expect(m.many.mock.calls[0][0]).toMatchObject({
      skip: 25,
      take: 25,
      where: { isActive: true },
    });
    expect((await result.json()).attendanceEnabled).toBe(true);
  });
  it("preserves Origin/body/rate controls and denies unauthorized modifications", async () => {
    expect(
      (await POST(req("POST", {}, "https://attacker.invalid"))).status,
    ).toBe(403);
    expect(m.auth).not.toHaveBeenCalled();
    m.auth.mockRejectedValue(new HttpError(403, "denied"));
    expect((await PATCH(req("PATCH", {}), ctx)).status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
    m.auth.mockResolvedValue({ id: "admin" });
    m.rate.mockRejectedValue(new HttpError(429, "limit"));
    expect((await POST(req("POST"))).status).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
});
describe("public permitted-shift options without identity proof", () => {
  it("returns only active permitted catalog fields without employee identity or department IDs", async () => {
    m.many.mockResolvedValue([
      { id, code: "S02", name: "مسائي", startTime: "16:30", endTime: "01:00" },
    ]);
    const response = await choices(
      req("POST", {
        email: "synthetic@earthlink.iq",
        departmentId: "attacker",
      }),
    );
    expect(response.status).toBe(200);
    expect(m.many.mock.calls[0][0].where).toEqual({
      isActive: true,
      OR: [
        { departments: { none: {} } },
        { departments: { some: { departmentId: dept } } },
      ],
    });
    const body = await response.text();
    expect(body).not.toContain(dept);
    expect(body).not.toContain("synthetic@earthlink.iq");
    expect(m.rate).toHaveBeenCalledTimes(2);
  });
  it.each([
    null,
    { status: "INACTIVE" },
    { status: "ACTIVE", deletedAt: new Date() },
  ])(
    "returns generic empty choices for unavailable employee %j",
    async (employee) => {
      m.employee.mockResolvedValue(employee);
      expect(
        await (
          await choices(req("POST", { email: "synthetic@earthlink.iq" }))
        ).json(),
      ).toEqual({ enabled: true, shifts: [] });
      expect(m.many).not.toHaveBeenCalled();
    },
  );
  it("disabled rollout exposes config but performs no employee lookup", async () => {
    vi.stubEnv("ATTENDANCE_SHIFTS_ENABLED", "false");
    expect(await (await config()).json()).toEqual({ enabled: false });
    expect(await (await choices(req("POST"))).json()).toEqual({
      enabled: false,
      shifts: [],
    });
    expect(m.employee).not.toHaveBeenCalled();
  });
  it("rejects missing/forged origin, invalid emails and requests over 64 KiB", async () => {
    expect((await choices(req("POST", {}, "null"))).status).toBe(403);
    expect(
      (await choices(req("POST", { email: "outside@example.invalid" }))).status,
    ).toBe(400);
    expect(
      (
        await choices(
          req("POST", {
            email: "synthetic@earthlink.iq",
            extra: "x".repeat(65536),
          }),
        )
      ).status,
    ).toBe(413);
    expect(m.employee).not.toHaveBeenCalled();
  });
});
