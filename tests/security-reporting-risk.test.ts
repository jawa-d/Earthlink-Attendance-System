import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ count: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ attendanceRecord: { count: m.count, findMany: m.rows } }) } }));
import { getAttendanceList } from "../src/lib/attendance-list";
beforeEach(() => vi.resetAllMocks());
describe("OPEN report cardinality risk (bounded synthetic fixture only)", () => {
  it("materializes more than the deletion workflow's 5000-row budget for ordinary exports", async () => {
    const date = new Date("2026-10-12T00:00:00Z");
    const fixture = Array.from({ length: 5001 }, (_, i) => ({ id: String(i), attendanceDate: date, employee: { fullName: "Synthetic", department: { name: "Synthetic" }, assignments: [] } }));
    m.count.mockResolvedValue(fixture.length); m.rows.mockResolvedValue(fixture);
    const result = await getAttendanceList(new URLSearchParams({ date: "2026-10-12" }), true);
    expect(result.rows).toHaveLength(5001);
    // This is evidence of an OPEN budget gap, not a production load test or a
    // guarantee of exhaustion at 5001 rows. Changing export completeness needs approval.
  });
});
