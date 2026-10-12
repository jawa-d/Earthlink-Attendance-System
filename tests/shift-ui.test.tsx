// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/client", () => ({
  api: m.api,
  ApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
      public data: Record<string, unknown>,
    ) {
      super(message);
    }
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/components/use-attendance-cooldown", () => ({
  useAttendanceCooldown: () => ({ status: "ready", blocked: false }),
}));
import { ShiftsPage } from "../src/components/shifts-page";
import Attendance from "../src/app/attendance/page";
import { RecordsTable } from "../src/components/records-table";
import { ApiError } from "@/lib/client";
const id = "00000000-0000-4000-8000-000000000001";
const shift = {
  id,
  code: "S02",
  name: "الشفت المسائي",
  startTime: "16:30",
  endTime: "01:00",
  isActive: true,
  updatedAt: "2026-10-12T00:00:00Z",
  departments: [],
};
const list = { rows: [shift], total: 1, page: 1, attendanceEnabled: true };
beforeEach(() => {
  vi.resetAllMocks();
  m.api.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/admin/departments") return [{ id, name: "قسم تجريبي" }];
    if (url.startsWith("/api/admin/shifts")) return options ? shift : list;
    if (url === "/api/attendance/shifts")
      return options?.method === "POST"
        ? { enabled: true, shifts: [shift] }
        : { enabled: true };
    if (url === "/api/attendance")
      return {
        name: "Synthetic",
        email: "synthetic@earthlink.iq",
        date: "2026-10-12",
        shiftLabel: "S02 — الشفت المسائي",
      };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}
describe("Arabic shift management and public selection", () => {
  it("refreshes and clears a stale selection when the server rejects a newly unavailable shift", async () => {
    const original = m.api.getMockImplementation()!;
    let unavailable = false;
    m.api.mockImplementation(async (url, options) => {
      if (url === "/api/attendance") {
        unavailable = true;
        throw new ApiError("الشفت لم يعد متاحاً", 400, {});
      }
      if (
        url === "/api/attendance/shifts" &&
        options?.method === "POST" &&
        unavailable
      )
        return { enabled: true, shifts: [] };
      return original(url, options);
    });
    mount(<Attendance />);
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني الوظيفي"), {
      target: { value: "synthetic@earthlink.iq" },
    });
    await screen.findByRole("option", { name: /S02 — الشفت المسائي/ });
    fireEvent.change(screen.getByLabelText("الشفت"), { target: { value: id } });
    const button = screen.getByRole("button", {
      name: "تسجيل الحضور",
    }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.submit(button.closest("form")!);
    await screen.findByText("الشفت لم يعد متاحاً");
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /S02 — الشفت المسائي/ }),
      ).toBeNull(),
    );
    expect((screen.getByLabelText("الشفت") as HTMLSelectElement).value).toBe(
      "",
    );
    expect(button.disabled).toBe(true);
    expect(m.push).not.toHaveBeenCalled();
  });
  it("VIEWER can read shifts but cannot see create/edit controls", async () => {
    mount(<ShiftsPage role="VIEWER" />);
    await screen.findByText(/S02 — الشفت المسائي/);
    expect(screen.queryByRole("button", { name: "+ إضافة شفت" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "تعديل / تغيير الحالة" }),
    ).toBeNull();
  });
  it("ADMIN can create a shift with selected restrictions and an audit reason", async () => {
    mount(<ShiftsPage role="ADMIN" />);
    await screen.findByText(/S02 — الشفت المسائي/);
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة شفت" }));
    fireEvent.change(screen.getByLabelText("رمز الشفت"), {
      target: { value: "S03" },
    });
    fireEvent.change(screen.getByLabelText("اسم الشفت بالعربية"), {
      target: { value: "الشفت الصباحي" },
    });
    fireEvent.change(screen.getByLabelText("البداية (بغداد)"), {
      target: { value: "08:00" },
    });
    fireEvent.change(screen.getByLabelText("النهاية (بغداد)"), {
      target: { value: "16:00" },
    });
    fireEvent.click(screen.getByLabelText("قسم تجريبي"));
    fireEvent.change(screen.getByLabelText("سبب التغيير"), {
      target: { value: "synthetic creation" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "حفظ الشفت" }).closest("form")!,
    );
    await waitFor(() =>
      expect(m.api).toHaveBeenCalledWith(
        "/api/admin/shifts",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const options = m.api.mock.calls.find(
      ([url, init]) => url === "/api/admin/shifts" && init?.method === "POST",
    )![1];
    expect(JSON.parse(options.body)).toMatchObject({
      code: "S03",
      departmentIds: [id],
      reason: "synthetic creation",
    });
  });
  it("existing shift editor retains time and restriction values and can deactivate", async () => {
    mount(<ShiftsPage role="SUPER_ADMIN" />);
    await screen.findByText(/S02 — الشفت المسائي/);
    fireEvent.click(
      screen.getByRole("button", { name: "تعديل / تغيير الحالة" }),
    );
    expect(
      (screen.getByLabelText("البداية (بغداد)") as HTMLInputElement).value,
    ).toBe("16:30");
    const status = screen
      .getAllByLabelText("الحالة")
      .find((element) => element.getAttribute("name") === "isActive")!;
    fireEvent.change(status, { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("سبب التغيير"), {
      target: { value: "synthetic deactivation" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "حفظ الشفت" }).closest("form")!,
    );
    await waitFor(() =>
      expect(m.api).toHaveBeenCalledWith(
        `/api/admin/shifts/${id}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });
  it("public form requires a loaded permitted shift and resets selection when email changes", async () => {
    mount(<Attendance />);
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني الوظيفي"), {
      target: { value: "synthetic@earthlink.iq" },
    });
    await screen.findByRole("option", { name: /S02 — الشفت المسائي/ });
    const button = screen.getByRole("button", {
      name: "تسجيل الحضور",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("الشفت"), { target: { value: id } });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.submit(button.closest("form")!);
    await waitFor(() =>
      expect(m.push).toHaveBeenCalledWith("/attendance/success"),
    );
    expect(
      JSON.parse(
        m.api.mock.calls.find(([url]) => url === "/api/attendance")![1].body,
      ),
    ).toEqual({ email: "synthetic@earthlink.iq", shiftId: id });
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني الوظيفي"), {
      target: { value: "other@earthlink.iq" },
    });
    expect((screen.getByLabelText("الشفت") as HTMLSelectElement).value).toBe(
      "",
    );
    expect(button.disabled).toBe(true);
  });
  it("public option failures block submit and offer retry; rollout off preserves email-only flow", async () => {
    m.api.mockImplementation(async (url, options) =>
      url === "/api/attendance/shifts" && !options?.method
        ? { enabled: false }
        : {},
    );
    mount(<Attendance />);
    await screen.findByText("لا يلزم اختيار شفت حالياً.");
    expect((screen.getByLabelText("الشفت") as HTMLSelectElement).disabled).toBe(
      true,
    );
    cleanup();
    m.api.mockRejectedValue(new Error("synthetic unavailable"));
    mount(<Attendance />);
    await screen.findByText("تعذر تحميل الشفتات. أعد المحاولة.");
    expect(
      (
        screen.getByRole("button", {
          name: "تسجيل الحضور",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "إعادة تحميل الشفتات" }),
    ).toBeDefined();
  });
  it("attendance tables show historical shift labels and retain legacy rows as بدون شفت", () => {
    mount(
      <RecordsTable
        kind="attendance"
        rows={[
          { id: "old", fullName: "Legacy" },
          {
            id: "shifted",
            fullName: "Synthetic",
            shiftCodeSnapshot: "OLD",
            shiftNameSnapshot: "اسم محفوظ",
          },
        ]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "الشفت" })).toBeDefined();
    expect(screen.getByText("بدون شفت")).toBeDefined();
    expect(screen.getByText("OLD — اسم محفوظ")).toBeDefined();
  });
});
