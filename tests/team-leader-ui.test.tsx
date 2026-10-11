// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api: m.api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { Management } from "../src/components/management";
import { TeamLeadersPage } from "../src/components/team-leaders-page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const departmentId = "dept",
  otherDepartment = "other";
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
describe("leader interface and employee integration", () => {
  it("attendance leader changes reset pagination and propagate all filters to exports", async () => {
    m.api.mockImplementation(async (url: string) => {
      if (url === "/api/admin/team-leaders") return [{ id: "leader", fullName: "ليدر تاريخي", departmentId: "old-department", isActive: false }];
      if (url === "/api/admin/departments") return [{ id: "department", name: "القسم", isActive: true }];
      return { rows: [], total: url.includes("teamLeaderId=leader") ? 0 : 60, page: 1 };
    });
    mount(<Management kind="attendance" role="SUPER_ADMIN" />);
    const select = await screen.findByLabelText("الليدر المسؤول");
    await screen.findByRole("option", { name: "ليدر تاريخي (غير فعال)" });
    await waitFor(() => expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => expect(m.api.mock.calls.some(([url]) => url.includes("/attendance?") && url.includes("page=2"))).toBe(true));
    fireEvent.change(screen.getByLabelText("البحث"), { target: { value: "Ali" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(select, { target: { value: "leader" } });
    await waitFor(() => expect(m.api.mock.calls.some(([url]) => url.includes("teamLeaderId=leader") && url.includes("page=1") && url.includes("q=Ali") && url.includes("deleted=true"))).toBe(true));
    for (const format of ["Excel", "PDF"]) {
      const href = screen.getByRole("link", { name: format }).getAttribute("href")!;
      const p = new URL(href, "https://example.com").searchParams;
      expect(p.get("teamLeaderId")).toBe("leader");
      expect(p.get("q")).toBe("Ali");
      expect(p.get("deleted")).toBe("true");
      expect(p.has("page")).toBe(false);
    }
    await screen.findByText("لا توجد سجلات تطابق البحث");
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("filters active leaders by department, selects inline creation, and preserves employee fields", async () => {
    const leaders = [
      { id: "active", fullName: "ليدر فعال", departmentId, isActive: true },
      { id: "inactive", fullName: "ليدر موقوف", departmentId, isActive: false },
      {
        id: "other",
        fullName: "ليدر قسم آخر",
        departmentId: otherDepartment,
        isActive: true,
      },
    ];
    m.api.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/admin/departments")
        return [
          { id: departmentId, name: "مركز الاتصال", isActive: true },
          { id: otherDepartment, name: "قسم آخر", isActive: true },
        ];
      if (url === "/api/admin/team-leaders" && options?.method === "POST") {
        const row = { id: "new", ...JSON.parse(options.body as string) };
        leaders.push(row);
        return row;
      }
      if (url === "/api/admin/team-leaders") return [...leaders];
      return { rows: [], total: 0, page: 1 };
    });
    mount(<Management kind="employees" role="ADMIN" />);
    await waitFor(() =>
      expect(m.api).toHaveBeenCalledWith("/api/admin/team-leaders"),
    );
    fireEvent.click(screen.getByRole("button", { name: "إضافة موظف" }));
    const employeeForm = within(
      screen.getByRole("dialog", { name: "إضافة سجل" }),
    );
    fireEvent.change(employeeForm.getByLabelText("الاسم الكامل"), {
      target: { value: "بيانات موظف غير محفوظة" },
    });
    const choices = employeeForm.getByLabelText(
      "الليدر المسؤول",
    ) as HTMLSelectElement;
    await waitFor(() =>
      expect(
        employeeForm.getByRole("option", { name: "مركز الاتصال" }),
      ).toBeTruthy(),
    );
    fireEvent.change(employeeForm.getByLabelText("القسم"), {
      target: { value: departmentId },
    });
    await waitFor(() => expect(choices.required).toBe(true));
    expect(
      within(choices).getByRole("option", { name: "ليدر فعال" }),
    ).toBeTruthy();
    expect(
      within(choices).queryByRole("option", { name: "ليدر موقوف" }),
    ).toBeNull();
    expect(
      within(choices).queryByRole("option", { name: "ليدر قسم آخر" }),
    ).toBeNull();
    fireEvent.click(employeeForm.getByRole("button", { name: "+ إضافة ليدر" }));
    const leaderForm = within(
      screen.getByRole("dialog", { name: "إضافة ليدر" }),
    );
    fireEvent.change(leaderForm.getByLabelText("الاسم الكامل"), {
      target: { value: "ليدر جديد" },
    });
    fireEvent.change(leaderForm.getByLabelText("سبب التغيير"), {
      target: { value: "إضافة ليدر مسؤول" },
    });
    fireEvent.click(leaderForm.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(
        (employeeForm.getByLabelText("الليدر المسؤول") as HTMLSelectElement)
          .value,
      ).toBe("new"),
    );
    expect(
      (employeeForm.getByLabelText("الاسم الكامل") as HTMLInputElement).value,
    ).toBe("بيانات موظف غير محفوظة");
    fireEvent.change(employeeForm.getByLabelText("القسم"), {
      target: { value: otherDepartment },
    });
    await waitFor(() =>
      expect(
        (employeeForm.getByLabelText("الليدر المسؤول") as HTMLSelectElement)
          .value,
      ).toBe(""),
    );
    expect(
      employeeForm.getByRole("option", { name: "ليدر قسم آخر" }),
    ).toBeTruthy();
  });
  it("keeps VIEWER read-only and provides a scoped employee link", async () => {
    m.api.mockImplementation(async (url: string) =>
      url === "/api/admin/departments"
        ? []
        : [
            {
              id: "leader",
              fullName: "ليدر تجريبي",
              departmentId,
              isActive: false,
              _count: { employees: 2 },
            },
          ],
    );
    mount(<TeamLeadersPage role="VIEWER" />);
    await screen.findByText("ليدر تجريبي");
    expect(screen.queryByRole("button", { name: "+ إضافة ليدر" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إعادة التعيين" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "عرض الموظفين" }).getAttribute("href"),
    ).toBe("/admin/employees?teamLeader=leader");
    expect(screen.getByText("2")).toBeTruthy();
  });
  it("renders grouped report counts and historical coverage warnings", async () => {
    m.api.mockImplementation(async (url: string) =>
      url === "/api/admin/departments" || url === "/api/admin/team-leaders"
        ? []
        : url.startsWith("/api/admin/team-leader-reports")
          ? {
              rows: [],
              total: 0,
              page: 1,
              historyIncomplete: true,
              groups: [
                {
                  id: "leader",
                  name: "ليدر تقرير",
                  totalAssignedActiveEmployees: 2,
                  employeeDays: 4,
                  present: 2,
                  absent: 1,
                  excused: 1,
                  percentage: 50,
                  unknownEmployeeDays: 1,
                },
              ],
            }
          : { rows: [], total: 0, page: 1 },
    );
    mount(<Management kind="reports" role="VIEWER" />);
    await screen.findByText("ليدر تقرير");
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/بعض الأيام تسبق سجل التوظيف/)).toBeTruthy();
  });
});
