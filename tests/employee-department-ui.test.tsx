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
import { DepartmentsPage } from "../src/components/departments-page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("employee department dropdown", () => {
  it("gives viewers read-only department counts and searchable filters", async () => {
    m.api.mockResolvedValue([
      {
        id: "dept",
        name: "مركز الاتصال",
        code: "CALL_CENTER",
        isActive: true,
        _count: { employees: 3 },
      },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <DepartmentsPage role="VIEWER" />
      </QueryClientProvider>,
    );
    await screen.findByText("مركز الاتصال");
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ إضافة قسم" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "تعديل / تغيير الحالة" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("بحث"), {
      target: { value: "CALL" },
    });
    fireEvent.change(screen.getByLabelText("الحالة"), {
      target: { value: "true" },
    });
    await waitFor(() =>
      expect(m.api).toHaveBeenCalledWith(
        "/api/admin/departments?q=CALL&active=true",
      ),
    );
  });
  it("creates an active department, selects it and preserves unsaved employee data", async () => {
    const rows = [{ id: "old", name: "قسم موقوف", isActive: false }];
    m.api.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/admin/departments" && options?.method === "POST") {
        const created = { id: "new", ...JSON.parse(options.body as string) };
        rows.push(created);
        return created;
      }
      if (url === "/api/admin/departments") return [...rows];
      if (url === "/api/admin/team-leaders") return [];
      return { rows: [], total: 0, page: 1 };
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Management kind="employees" role="SUPER_ADMIN" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(m.api).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /إضافة موظف/ }));
    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "موظف جديد" },
    });
    expect(screen.queryByRole("option", { name: "قسم موقوف" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة قسم" }));
    fireEvent.change(screen.getByLabelText("الاسم بالعربية"), {
      target: { value: "مركز الاتصال" },
    });
    fireEvent.change(screen.getByLabelText("رمز القسم"), {
      target: { value: "CALL_CENTER" },
    });
    const departmentModal = within(
      screen.getByRole("dialog", { name: "إضافة قسم" }),
    );
    fireEvent.change(departmentModal.getByLabelText("سبب التغيير"), {
      target: { value: "إضافة قسم جديد" },
    });
    fireEvent.click(departmentModal.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(
        (
          within(
            screen.getByRole("dialog", { name: "إضافة سجل" }),
          ).getByLabelText("القسم") as HTMLSelectElement
        ).value,
      ).toBe("new"),
    );
    expect(
      (screen.getByLabelText("الاسم الكامل") as HTMLInputElement).value,
    ).toBe("موظف جديد");
  });
});
