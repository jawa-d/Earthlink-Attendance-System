import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), employees: vi.fn(), authorize: vi.fn(), leader: vi.fn(), pdf: vi.fn(), excel: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/db", () => ({ db: {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ attendanceRecord: { findMany: m.find, count: m.count } }),
  employee: { findMany: m.employees }, teamLeader: { findUnique: m.leader },
} }));
vi.mock("@/lib/export", () => ({ headers: Array(8).fill("header"), statusNames: { PRESENT: "حاضر" }, pdfReport: m.pdf, spreadsheet: m.excel }));
import { attendanceFilters, getAttendanceList } from "../src/lib/attendance-list";
import { GET } from "../src/app/api/admin/[resource]/route";
import { GET as exportGET } from "../src/app/api/admin/export/route";
import { HttpError } from "../src/lib/http";
const leader = "38f20893-7242-4f23-a144-5026dc22e112";
const department = "fb11dd16-37b2-4053-bf49-d13a0476f158";
const params = (extra = "") => new URLSearchParams(`start=2026-10-10&end=2026-10-11&${extra}`);
function record(day: string, assignments: unknown[] = []) {
  return { id: day, attendanceDate: new Date(day), status: "PRESENT", checkInAt: null, registrationMethod: "QR", employee: { employeeNumber: "1", fullName: "Employee", normalizedEmail: "e@earthlink.iq", department: { name: "Dept" }, assignments } };
}
beforeEach(() => {
  vi.resetAllMocks(); m.authorize.mockResolvedValue({ role: "ADMIN" });
  m.find.mockResolvedValue([]); m.count.mockResolvedValue(0); m.employees.mockResolvedValue([]);
  m.leader.mockResolvedValue({ fullName: "Selected leader" });
  m.pdf.mockResolvedValue(Buffer.from("pdf")); m.excel.mockResolvedValue(Buffer.from("excel"));
});
describe("attendance leader filters", () => {
  it("all leaders has no assignment restriction, including unassigned and unknown history", async () => {
    expect(attendanceFilters(params()).where).not.toHaveProperty("OR");
    m.find.mockResolvedValue([record("2026-10-10")]); m.count.mockResolvedValue(1);
    expect((await getAttendanceList(params())).rows[0]).toMatchObject({ historyUnknown: true, teamLeaderName: "غير معروف تاريخياً" });
  });
  it("selected leader is constrained by attendance date and historical relation", () => {
    const f = attendanceFilters(params(`teamLeaderId=${leader}`));
    expect(f.where.OR).toHaveLength(2);
    expect(f.where.OR?.[0]).toMatchObject({ attendanceDate: new Date("2026-10-10"), employee: { assignments: { some: { teamLeaderId: leader, effectiveFrom: { lte: new Date("2026-10-10") }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date("2026-10-10") } }] } } } });
  });
  it("combines department, search, employee, status, deleted and leader using AND", () => {
    const f = attendanceFilters(params(`teamLeaderId=${leader}&department=${department}&q=Ali&employee=${department}&status=LATE&deleted=true`));
    expect(f.where).toMatchObject({ status: "LATE", employee: { id: department }, attendanceDate: { gte: new Date("2026-10-10"), lte: new Date("2026-10-11") } });
    expect(f.where.employee).toHaveProperty("OR");
    expect(f.where).not.toHaveProperty("deletedAt");
    expect(f.assignment(new Date("2026-10-10"))).toMatchObject({ departmentId: department, teamLeaderId: leader });
  });
  it("unassigned uses explicit historical null; empty leader results stay empty", async () => {
    expect(attendanceFilters(params("teamLeaderId=unassigned")).assignment(new Date())).toMatchObject({ teamLeaderId: null });
    expect(await getAttendanceList(params(`teamLeaderId=${leader}`))).toMatchObject({ rows: [], total: 0 });
  });
  it("count and pagination share predicate and exports omit page limits", async () => {
    m.count.mockResolvedValue(60);
    const result = await getAttendanceList(params(`teamLeaderId=${leader}&page=2`));
    expect(result).toMatchObject({ total: 60, page: 2 });
    expect(m.find.mock.calls[0][0]).toMatchObject({ skip: 25, take: 25, where: m.count.mock.calls[0][0].where });
    await getAttendanceList(params(`teamLeaderId=${leader}&page=2`), true);
    expect(m.find.mock.calls[1][0]).not.toHaveProperty("take");
    expect(m.find.mock.calls[1][0]).not.toHaveProperty("skip");
  });
  it("uses exclusive historical end boundary and never current leader", async () => {
    const old = { effectiveFrom: new Date("2026-10-01"), effectiveTo: new Date("2026-10-11"), leaderName: "Old", departmentName: "Old dept" };
    const next = { effectiveFrom: new Date("2026-10-11"), effectiveTo: null, leaderName: "New", departmentName: "New dept" };
    m.find.mockResolvedValue([record("2026-10-10", [next, old]), record("2026-10-11", [next, old])]);
    expect((await getAttendanceList(params())).rows.map(r => r.teamLeaderName)).toEqual(["Old", "New"]);
  });
  it("validates IDs and ranges before querying", async () => {
    expect(() => attendanceFilters(params("teamLeaderId=bad"))).toThrow();
    expect(() => attendanceFilters(new URLSearchParams("start=2026-10-12&end=2026-10-11"))).toThrow();
    expect(m.find).not.toHaveBeenCalled();
  });
  it("filters synthetic unregistered days through active historical assignments", async () => {
    await getAttendanceList(params(`status=UNREGISTERED&teamLeaderId=${leader}`));
    expect(m.employees).toHaveBeenCalledTimes(2);
    expect(m.employees.mock.calls[0][0].where.AND[1]).toMatchObject({ assignments: { some: { teamLeaderId: leader, status: "ACTIVE" } }, attendance: { none: { deletedAt: null } } });
  });
  it.each(["xlsx", "pdf"])("%s export shares listing filters and exports every matching event", async format => {
    m.find.mockResolvedValue(Array.from({ length: 30 }, () => record("2026-10-10"))); m.count.mockResolvedValue(30);
    const p = params(`kind=attendance&format=${format}&teamLeaderId=${leader}&q=Ali&department=${department}&deleted=true`);
    const response = await exportGET(new Request(`https://example.com/api/admin/export?${p}`));
    expect(response.status).toBe(200);
    const fn = format === "pdf" ? m.pdf : m.excel;
    const rows = fn.mock.calls[0][format === "pdf" ? 1 : 0];
    expect(rows).toHaveLength(30);
    expect(fn.mock.calls[0][format === "pdf" ? 0 : 1]).toContain("Selected leader");
    expect(m.find.mock.calls[0][0]).not.toHaveProperty("take");
    expect(m.find.mock.calls[0][0].where).toEqual(attendanceFilters(p).where);
  });
  it.each([401, 403])("blocks unauthorized listing and export (%s)", async code => {
    m.authorize.mockRejectedValue(new HttpError(code, "denied"));
    expect((await GET(new Request("https://example.com/api/admin/attendance"), { params: Promise.resolve({ resource: "attendance" }) })).status).toBe(code);
    expect((await exportGET(new Request("https://example.com/api/admin/export?kind=attendance"))).status).toBe(code);
    expect(m.find).not.toHaveBeenCalled();
  });
});
