import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
const m = vi.hoisted(() => ({
  snapshots: new Map<string, Record<string, unknown>>(),
  find: vi.fn(), remove: vi.fn(), query: vi.fn(), audit: vi.fn(), auditMany: vi.fn(),
  authorize: vi.fn(), session: vi.fn(), rateLimit: vi.fn(), password: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@node-rs/argon2", () => ({ verify: m.password }));
vi.mock("@/lib/auth", async () => {
  const { createHash } = await import("node:crypto");
  return { authorize: m.authorize, currentSessionId: m.session, rateLimit: m.rateLimit,
    tokenHash: (s: string) => createHash("sha256").update(s).digest("hex") };
});
vi.mock("@/lib/service", () => ({ audit: m.audit }));
vi.mock("@/lib/db", () => {
  const tx = {
    attendanceRecord: { findMany: m.find, deleteMany: m.remove },
    auditLog: { createMany: m.auditMany },
    $queryRaw: m.query, $executeRaw: vi.fn(),
    attendanceDeletionSnapshot: {
      create: vi.fn(async ({ data }) => { m.snapshots.set(data.id, { exportedAt: null, fileHash: null, reauthenticatedAt: null, codeVerifiedAt: null, consumedAt: null, ...data }); return data; }),
      findUnique: vi.fn(async ({ where }) => m.snapshots.get(where.id)),
      update: vi.fn(async ({ where, data }) => { const row = { ...m.snapshots.get(where.id), ...data }; m.snapshots.set(where.id, row); return row; }),
    },
  };
  return { db: { $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
    m.transaction(options);
    const previous = structuredClone(m.snapshots);
    try { return await fn(tx); } catch (err) { m.snapshots = previous; throw err; }
  } } };
});
import { POST, DELETE } from "../src/app/api/admin/attendance-deletion/route";
import { HttpError } from "../src/lib/http";
const first = "38f20893-7242-4f23-a144-5026dc22e112";
const second = "fb11dd16-37b2-4053-bf49-d13a0476f158";
const employee = "91f20893-7242-4f23-a144-5026dc22e113";
function records() {
  return [first, second].map(id => ({
    id, employeeId: employee, attendanceDate: new Date("2026-10-11"), checkInAt: new Date("2026-10-11T05:00:43Z"),
    originalCheckInAt: new Date("2026-10-11T05:00:43Z"), registeredAt: new Date("2026-10-11T05:00:43Z"),
    status: "PRESENT", registrationMethod: "QR", createdByAdminId: null, modificationReason: null,
    deletedAt: null, createdAt: new Date("2026-10-11"), updatedAt: new Date("2026-10-11"),
    employee: { id: employee, fullName: "موظف تجريبي", employeeNumber: "123", normalizedEmail: "test@earthlink.iq",
      department: { name: "Current department" }, assignments: [{
        effectiveFrom: new Date("2026-10-01"), effectiveTo: null, teamLeaderId: first, leaderName: "ليدر تاريخي", departmentId: second, departmentName: "القسم التاريخي",
      }] },
  }));
}
const request = (method: string, body: unknown, origin = "https://attendance.example") => new Request("https://attendance.example/api/admin/attendance-deletion", {
  method, headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function prepare(selection: unknown = { ids: [first, second] }) {
  const response = await POST(request("POST", { action: "prepare", selection }));
  expect(response.status).toBe(200);
  return response.json() as Promise<{ snapshotId: string; code: string; count: number }>;
}
async function backup(snapshotId: string) {
  const response = await POST(request("POST", { action: "export", snapshotId }));
  expect(response.status).toBe(200);
  return response;
}
async function ready() {
  const snapshot = await prepare();
  const response = await backup(snapshot.snapshotId);
  expect((await POST(request("POST", { action: "reauthenticate", snapshotId: snapshot.snapshotId, password: "test-password" }))).status).toBe(200);
  expect((await POST(request("POST", { action: "verify", snapshotId: snapshot.snapshotId, code: snapshot.code }))).status).toBe(200);
  return { snapshotId: snapshot.snapshotId, code: snapshot.code, receipt: response.headers.get("X-Backup-Receipt")!, backupConfirmed: true, reason: "approved deletion" };
}
beforeEach(() => {
  vi.clearAllMocks(); m.snapshots.clear();
  process.env.APP_URL = "https://attendance.example";
  m.authorize.mockResolvedValue({ id: first, role: "SUPER_ADMIN", passwordHash: "hash" });
  m.session.mockResolvedValue("session-hash"); m.password.mockResolvedValue(true);
  m.rateLimit.mockResolvedValue(undefined); m.find.mockResolvedValue(records());
  m.remove.mockResolvedValue({ count: 2 }); m.audit.mockResolvedValue(undefined);
  m.auditMany.mockResolvedValue({ count: 2 });
});
describe("permanent attendance deletion with Excel consent (mock database only)", () => {
  it("creates an exact snapshot without deleting anything; code is hashed at rest", async () => {
    const snapshot = await prepare();
    expect(snapshot.count).toBe(2);
    expect(m.snapshots.get(snapshot.snapshotId)?.codeHash).not.toBe(snapshot.code);
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.find.mock.calls[0][0].where).toEqual({ id: { in: [first, second] } });
  });
  it("exports only snapshot records with all identifiers and historical attribution", async () => {
    const snapshot = await prepare();
    m.find.mockResolvedValue([]); // Export remains bound to the saved selection.
    const response = await backup(snapshot.snapshotId);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = book.worksheets[0];
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(3).values).toEqual(expect.arrayContaining(["موظف تجريبي", "123", "test@earthlink.iq", "القسم التاريخي", "ليدر تاريخي", "2026-10-11", "08:00:43", "حاضر", first, employee]));
    expect(response.headers.get("X-Backup-Receipt")).toHaveLength(64);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("requires export before password reauthentication or code verification", async () => {
    const snapshot = await prepare();
    expect((await POST(request("POST", { action: "reauthenticate", snapshotId: snapshot.snapshotId, password: "password" }))).status).toBe(409);
    expect((await POST(request("POST", { action: "verify", ...snapshot }))).status).toBe(400); // Strict input prevents extra fields.
    expect((await POST(request("POST", { action: "verify", snapshotId: snapshot.snapshotId, code: snapshot.code }))).status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("rejects absent/false confirmation, wrong receipt and wrong code without deleting", async () => {
    const input = await ready();
    for (const patch of [{ backupConfirmed: false }, { backupConfirmed: undefined }, { receipt: "a".repeat(64) }, { code: input.code === "00000000" ? "FFFFFFFF" : "00000000" }]) {
      expect((await DELETE(request("DELETE", { ...input, ...patch }))).status).toBe(400);
    }
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("requires successful server-side verification even with the correct code", async () => {
    const input = await ready(); m.snapshots.get(input.snapshotId)!.codeVerifiedAt = null;
    expect((await DELETE(request("DELETE", input))).status).toBe(400);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("rejects bad passwords and expired reauthentication", async () => {
    const input = await ready(); m.password.mockResolvedValue(false);
    expect((await POST(request("POST", { action: "reauthenticate", snapshotId: input.snapshotId, password: "wrong" }))).status).toBe(401);
    m.snapshots.get(input.snapshotId)!.reauthenticatedAt = new Date(Date.now() - 5 * 60000);
    expect((await DELETE(request("DELETE", input))).status).toBe(401);
    expect(m.rateLimit).toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it("rejects wrong codes at verification", async () => {
    const input = await ready();
    expect((await POST(request("POST", { action: "verify", snapshotId: input.snapshotId, code: input.code === "00000000" ? "FFFFFFFF" : "00000000" }))).status).toBe(400);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it.each(["update", "remove", "employee", "historical-leader"])("rejects %s changes since the backup", async change => {
    const input = await ready(), changed = records();
    if (change === "update") changed[0].updatedAt = new Date("2026-10-12");
    if (change === "remove") changed.pop();
    if (change === "employee") changed[0].employee.fullName = "changed";
    if (change === "historical-leader") changed[0].employee.assignments[0].leaderName = "changed";
    m.find.mockResolvedValue(changed);
    expect((await DELETE(request("DELETE", input))).status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("binds bulk selection to all matching records, not a page, and rejects new matches", async () => {
    const snapshot = await prepare({ filters: { start: "2026-10-11", end: "2026-10-11", teamLeaderId: first, department: second, q: "test", deleted: "true", page: "2" } });
    expect(m.find.mock.calls[0][0]).not.toHaveProperty("skip");
    expect(m.find.mock.calls[0][0].where).toMatchObject({ attendanceDate: { gte: new Date("2026-10-11") }, OR: [{ employee: { assignments: { some: { teamLeaderId: first, departmentId: second } } } }] });
    const response = await backup(snapshot.snapshotId);
    await POST(request("POST", { action: "reauthenticate", snapshotId: snapshot.snapshotId, password: "password" }));
    await POST(request("POST", { action: "verify", snapshotId: snapshot.snapshotId, code: snapshot.code }));
    m.find.mockResolvedValue([...records(), { ...records()[0], id: employee }]);
    expect((await DELETE(request("DELETE", { snapshotId: snapshot.snapshotId, code: snapshot.code, receipt: response.headers.get("X-Backup-Receipt"), backupConfirmed: true, reason: "approved deletion" }))).status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("blocks different sessions, owners, expired and consumed snapshots", async () => {
    const input = await ready();
    m.session.mockResolvedValue("different-session");
    expect((await DELETE(request("DELETE", input))).status).toBe(404);
    m.session.mockResolvedValue("session-hash");
    m.authorize.mockResolvedValue({ id: second, role: "SUPER_ADMIN", passwordHash: "hash" });
    expect((await DELETE(request("DELETE", input))).status).toBe(404);
    m.authorize.mockResolvedValue({ id: first, role: "SUPER_ADMIN", passwordHash: "hash" });
    m.snapshots.get(input.snapshotId)!.expiresAt = new Date(0);
    expect((await DELETE(request("DELETE", input))).status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("deletes only snapshot IDs atomically and preserves per-record and batch audits", async () => {
    const input = await ready();
    expect((await DELETE(request("DELETE", input))).status).toBe(200);
    expect(m.remove).toHaveBeenCalledWith({ where: { id: { in: [first, second] } } });
    expect(m.auditMany.mock.calls[0][0].data).toHaveLength(2);
    expect(m.auditMany.mock.calls[0][0].data[0]).toMatchObject({ actorAdminId: first, action: "PERMANENT_DELETE", entityType: "AttendanceRecord", entityId: first, oldValues: { originalCheckInAt: "2026-10-11T05:00:43.000Z" }, newValues: { snapshotId: input.snapshotId }, reason: "approved deletion" });
    expect(m.audit).toHaveBeenCalledWith(expect.anything(), first, "PERMANENT_DELETE_BATCH", "AttendanceDeletionSnapshot", input.snapshotId, null, expect.objectContaining({ count: 2, recordIds: [first, second], backupConfirmed: true }), "approved deletion");
    expect(m.transaction).toHaveBeenLastCalledWith({ isolationLevel: "Serializable", timeout: 30000 });
    expect((await DELETE(request("DELETE", input))).status).toBe(409);
    expect(m.remove).toHaveBeenCalledTimes(1);
  });
  it("re-export invalidates old password/code approvals", async () => {
    const input = await ready(); await backup(input.snapshotId);
    expect((await DELETE(request("DELETE", input))).status).toBe(401);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("fails closed if audit fails and never reaches deletion", async () => {
    const input = await ready(); m.auditMany.mockRejectedValueOnce(new Error("audit unavailable"));
    expect((await DELETE(request("DELETE", input))).status).toBe(500);
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.snapshots.get(input.snapshotId)!.consumedAt).toBeNull();
  });
  it("rejects empty and oversized selections and synthetic attendance", async () => {
    m.find.mockResolvedValue([]);
    expect((await POST(request("POST", { action: "prepare", selection: { ids: [first] } }))).status).toBe(409);
    expect((await POST(request("POST", { action: "prepare", selection: { filters: { status: "UNREGISTERED" } } }))).status).toBe(400);
    m.find.mockResolvedValue(Array.from({ length: 5001 }, () => records()[0]));
    expect((await POST(request("POST", { action: "prepare", selection: { filters: {} } }))).status).toBe(400);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it.each([401, 403])("enforces server SUPER_ADMIN authorization (%s)", async status => {
    m.authorize.mockRejectedValue(new HttpError(status, "forbidden"));
    expect((await POST(request("POST", { action: "prepare", selection: { ids: [first] } }))).status).toBe(status);
    expect((await DELETE(request("DELETE", {}))).status).toBe(status);
    expect(m.authorize).toHaveBeenCalledWith("super");
    expect(m.find).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect((await POST(request("POST", {}, "https://attacker.example"))).status).toBe(403);
    expect((await DELETE(request("DELETE", {}, "https://attacker.example"))).status).toBe(403);
    expect(m.authorize).not.toHaveBeenCalled();
  });
});
