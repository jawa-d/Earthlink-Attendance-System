import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authorize: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/leader-report-service", () => ({ getLeaderReport: m.report }));
import { GET } from "../src/app/api/admin/team-leader-reports/route";
import { HttpError } from "../src/lib/http";
beforeEach(() => {
  vi.resetAllMocks();
  m.authorize.mockResolvedValue({ role: "VIEWER" });
  m.report.mockResolvedValue({
    rows: Array.from({ length: 30 }, (_, i) => ({ id: i })),
    groups: [],
    historyIncomplete: false,
  });
});
describe("protected leader report API", () => {
  it("allows read roles, paginates and disables caching", async () => {
    const r = await GET(
      new Request(
        "https://example.invalid/api/admin/team-leader-reports?page=2",
      ),
    );
    const result = await r.json();
    expect(r.status).toBe(200);
    expect(result.rows.length).toBe(5);
    expect(result.total).toBe(30);
    expect(m.authorize).toHaveBeenCalledWith("read");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects anonymous access before any employee report query", async () => {
    m.authorize.mockRejectedValue(new HttpError(401, "denied"));
    expect(
      (
        await GET(
          new Request("https://example.invalid/api/admin/team-leader-reports"),
        )
      ).status,
    ).toBe(401);
    expect(m.report).not.toHaveBeenCalled();
  });
});
