import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  department: vi.fn(),
  leader: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  audit: vi.fn(),
  close: vi.fn(),
  upsert: vi.fn(),
  lock: vi.fn(),
  rowLock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/service", () => ({ audit: m.audit }));
vi.mock("@/lib/db", () => ({
  db: {
    employee: { findMany: m.list, count: vi.fn().mockResolvedValue(0) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        department: {
          findUnique: m.department,
          findUniqueOrThrow: m.department,
        },
        teamLeader: {
          findUnique: m.leader,
          findUniqueOrThrow: m.leader,
          count: m.count,
        },
        employee: { create: m.create, findUnique: m.find, update: m.update },
        employeeAssignment: { updateMany: m.close, upsert: m.upsert },
        $executeRaw: m.lock,
        $queryRaw: m.rowLock,
      }),
  },
}));
import { GET, POST } from "../src/app/api/admin/[resource]/route";
import { PATCH, DELETE } from "../src/app/api/admin/[resource]/[id]/route";
const id = "38f20893-7242-4f23-a144-5026dc22e112";
const departmentId = "fb11dd16-37b2-4053-bf49-d13a0476f158";
const leaderId = "dd393fb7-6f85-45af-aa67-ea06a3c7a555";
const data = {
  employeeNumber: "123",
  fullName: "موظف تجريبي",
  normalizedEmail: "synthetic@earthlink.iq",
  departmentId,
  status: "ACTIVE",
  reason: "تغيير إداري موثق",
};
const ctx = { params: Promise.resolve({ resource: "employees", id }) };
function request(method: string, body: unknown = data) {
  return new Request("https://attendance.example.com/api/admin/employees", {
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
  m.department.mockResolvedValue({ isActive: true, name: "مركز الاتصال" });
  m.count.mockResolvedValue(1);
  m.leader.mockResolvedValue({
    id: leaderId,
    departmentId,
    isActive: true,
    fullName: "ليدر تجريبي",
  });
  m.find.mockResolvedValue({
    id,
    ...data,
    teamLeaderId: null,
    deletedAt: null,
  });
  m.create.mockImplementation(async ({ data }) => ({
    id,
    teamLeaderId: null,
    deletedAt: null,
    ...data,
  }));
  m.update.mockImplementation(async ({ data: fields }) => ({
    id,
    ...data,
    teamLeaderId: null,
    deletedAt: null,
    ...fields,
  }));
  m.list.mockResolvedValue([]);
});
describe("employee leader assignment API integration", () => {
  it("rejects creation without a leader once a department has leaders", async () => {
    expect((await POST(request("POST"), ctx)).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("preserves legacy creation without a leader in unconfigured departments", async () => {
    m.count.mockResolvedValue(0);
    expect((await POST(request("POST"), ctx)).status).toBe(201);
    expect(m.upsert.mock.calls[0][0].create.teamLeaderId).toBeNull();
  });
  it("records the initial dated assignment and audit for a new assigned employee", async () => {
    expect(
      (await POST(request("POST", { ...data, teamLeaderId: leaderId }), ctx))
        .status,
    ).toBe(201);
    expect(m.upsert.mock.calls[0][0].create).toMatchObject({
      employeeId: id,
      teamLeaderId: leaderId,
      status: "ACTIVE",
    });
    expect(m.audit.mock.calls[0][2]).toBe("CREATE");
    expect(m.lock).toHaveBeenCalledTimes(1);
  });
  it("records reassignment and preserves omitted existing assignments", async () => {
    expect(
      (await PATCH(request("PATCH", { ...data, teamLeaderId: leaderId }), ctx))
        .status,
    ).toBe(200);
    expect(m.audit.mock.calls[0][2]).toBe("REASSIGN");
    expect(m.upsert).toHaveBeenCalledTimes(1);
    m.find.mockResolvedValue({
      id,
      ...data,
      teamLeaderId: leaderId,
      deletedAt: null,
    });
    expect((await PATCH(request("PATCH"), ctx)).status).toBe(200);
    expect(m.update.mock.calls[1][0].data.teamLeaderId).toBe(leaderId);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });
  it("refuses inactive or cross-department assignment before changing employees", async () => {
    m.leader.mockResolvedValue({ isActive: false, departmentId });
    expect(
      (await PATCH(request("PATCH", { ...data, teamLeaderId: leaderId }), ctx))
        .status,
    ).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
    m.leader.mockResolvedValue({ isActive: true, departmentId: id });
    expect(
      (await POST(request("POST", { ...data, teamLeaderId: leaderId }), ctx))
        .status,
    ).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("records soft deletion as an inactive dated snapshot without removing attendance", async () => {
    expect((await DELETE(request("DELETE"), ctx)).status).toBe(200);
    expect(m.upsert.mock.calls[0][0].create.status).toBe("INACTIVE");
    expect(m.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });
  it("filters employee lists by leader and includes the assigned leader", async () => {
    expect(
      (
        await GET(
          new Request(
            `https://attendance.example.com/api/admin/employees?teamLeader=${leaderId}`,
          ),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(m.list.mock.calls[0][0]).toMatchObject({
      where: { teamLeaderId: leaderId },
      include: { teamLeader: true, department: true },
    });
  });
});
