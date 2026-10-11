import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  dept: vi.fn(),
  employeeCount: vi.fn(),
  employeeList: vi.fn(),
  employeeUpdate: vi.fn(),
  audit: vi.fn(),
  historyClose: vi.fn(),
  historyUpsert: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/db", () => ({
  db: {
    teamLeader: { findMany: m.list },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        teamLeader: {
          findUnique: m.find,
          findUniqueOrThrow: m.find,
          create: m.create,
          update: m.update,
        },
        department: { findUnique: m.dept, findUniqueOrThrow: m.dept },
        employee: {
          count: m.employeeCount,
          findMany: m.employeeList,
          update: m.employeeUpdate,
        },
        employeeAssignment: {
          updateMany: m.historyClose,
          upsert: m.historyUpsert,
        },
        $executeRaw: m.execute,
        $queryRaw: m.query,
      }),
  },
}));
vi.mock("@/lib/service", () => ({ audit: m.audit }));
import { GET, POST } from "../src/app/api/admin/team-leaders/route";
import { PATCH, DELETE } from "../src/app/api/admin/team-leaders/[id]/route";
import { POST as reassign } from "../src/app/api/admin/team-leaders/[id]/reassign/route";
import { HttpError } from "../src/lib/http";
const id = "38f20893-7242-4f23-a144-5026dc22e112",
  departmentId = "fb11dd16-37b2-4053-bf49-d13a0476f158",
  targetId = "dd393fb7-6f85-45af-aa67-ea06a3c7a555";
const ctx = { params: Promise.resolve({ id }) };
const data = {
  fullName: "ليدر تجريبي",
  departmentId,
  isActive: true,
  reason: "تغيير إداري موثق",
};
function request(method: string, body: unknown = data) {
  return new Request("https://attendance.example.com/api/admin/team-leaders", {
    method,
    headers: {
      origin: "https://attendance.example.com",
      "content-type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = "https://attendance.example.com";
  m.authorize.mockResolvedValue({ id: "admin", role: "ADMIN" });
  m.dept.mockResolvedValue({ isActive: true, name: "مركز الاتصال" });
  m.employeeCount.mockResolvedValue(0);
  m.find.mockResolvedValue({ id, ...data });
  m.create.mockImplementation(async ({ data }) => ({ id, ...data }));
  m.update.mockImplementation(async ({ data }) => ({ id, ...data }));
  m.list.mockResolvedValue([]);
});
describe("team leader management endpoints", () => {
  it("supports authorized ADMIN creation and audited updates/deactivation", async () => {
    expect((await POST(request("POST"))).status).toBe(201);
    expect(m.authorize).toHaveBeenCalledWith("write");
    expect(
      (await PATCH(request("PATCH", { ...data, isActive: false }), ctx)).status,
    ).toBe(200);
    expect(m.audit.mock.calls[1][2]).toBe("DEACTIVATE");
  });
  it.each([401, 403])(
    "rejects anonymous/viewer mutations before writes (%s)",
    async (status) => {
      m.authorize.mockRejectedValue(new HttpError(status, "denied"));
      expect((await POST(request("POST"))).status).toBe(status);
      expect((await PATCH(request("PATCH"), ctx)).status).toBe(status);
      expect(
        (
          await reassign(
            request("POST", { targetLeaderId: targetId, reason: data.reason }),
            ctx,
          )
        ).status,
      ).toBe(status);
      expect(m.create).not.toHaveBeenCalled();
      expect(m.employeeUpdate).not.toHaveBeenCalled();
    },
  );
  it("supports read permission, department/active filtering and linked employee counts", async () => {
    expect(
      (
        await GET(
          new Request(
            `https://attendance.example.com/api/admin/team-leaders?department=${departmentId}&active=true`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(m.authorize).toHaveBeenCalledWith("read");
    expect(m.list.mock.calls[0][0]).toMatchObject({
      where: { departmentId, isActive: true },
      include: {
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
    });
  });
  it("requires valid leader fields and active department", async () => {
    expect(
      (await POST(request("POST", { ...data, fullName: "" }))).status,
    ).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
    m.dept.mockResolvedValue({ isActive: false });
    expect((await POST(request("POST"))).status).toBe(400);
  });
  it("refuses moving a leader with assigned employees and physical deletion", async () => {
    m.employeeCount.mockResolvedValue(1);
    expect(
      (await PATCH(request("PATCH", { ...data, departmentId: targetId }), ctx))
        .status,
    ).toBe(409);
    expect((await DELETE(request("DELETE"))).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("reassigns to a same-department active leader, records history and audits each employee", async () => {
    m.find.mockImplementation(async ({ where }) => ({ id: where.id, ...data }));
    m.employeeList.mockResolvedValue([
      { id: "employee", departmentId, teamLeaderId: id },
    ]);
    m.employeeUpdate.mockResolvedValue({
      id: "employee",
      departmentId,
      teamLeaderId: targetId,
      status: "ACTIVE",
      deletedAt: null,
    });
    expect(
      (
        await reassign(
          request("POST", {
            targetLeaderId: targetId,
            deactivateSource: true,
            reason: data.reason,
          }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(m.historyUpsert).toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledTimes(2);
    expect(m.update).toHaveBeenCalledWith({
      where: { id },
      data: { isActive: false },
    });
  });
  it("refuses cross-department or inactive reassignments before employee writes", async () => {
    m.find.mockImplementation(async ({ where }) => ({
      id: where.id,
      ...data,
      isActive: where.id === id,
    }));
    expect(
      (
        await reassign(
          request("POST", { targetLeaderId: targetId, reason: data.reason }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(m.employeeUpdate).not.toHaveBeenCalled();
  });
});
