// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const m = vi.hoisted(() => ({ api: vi.fn(), fetch: vi.fn(), download: vi.fn(), close: vi.fn(), deleted: vi.fn() }));
vi.mock("@/lib/client", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/client")>("@/lib/client");
  return { ...actual, api: m.api };
});
import { ApiError } from "../src/lib/client";
import { AttendancePermanentDelete } from "../src/components/attendance-permanent-delete";
const snapshotId = "38f20893-7242-4f23-a144-5026dc22e112";
const selection = { filters: { start: "2026-10-11", end: "2026-10-11", department: "dept" } };
const checkbox = "أؤكد أنني قمت بتحميل نسخة Excel احتياطية من سجلات الحضور.";
beforeEach(() => {
  vi.resetAllMocks();
  m.api.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "prepare") return { snapshotId, count: 42, code: "A1B2C3D4", expiresAt: "2026-10-11T22:00:00Z" };
    return { ok: true };
  });
  m.fetch.mockResolvedValue({ ok: true, headers: new Headers({ "X-Backup-Receipt": "a".repeat(64) }), blob: async () => new Blob(["excel-file"]) });
  vi.stubGlobal("fetch", m.fetch);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:backup");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(m.download);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  render(<AttendancePermanentDelete selection={selection} onClose={m.close} onDeleted={m.deleted} />);
  await screen.findByText("عدد السجلات المحددة بالضبط: 42");
}
async function exported() {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
  await screen.findByLabelText(checkbox);
}
describe("mandatory backup consent interface", () => {
  it("shows exact bulk count and keeps consent hidden until the full export completes", async () => {
    let resolveBlob!: (blob: Blob) => void;
    m.fetch.mockResolvedValue({ ok: true, headers: new Headers({ "X-Backup-Receipt": "a".repeat(64) }), blob: () => new Promise(resolve => { resolveBlob = resolve; }) });
    await mount();
    expect(screen.queryByLabelText(checkbox)).toBeNull();
    const final = screen.getByRole("button", { name: "حذف 42 سجل نهائياً" }) as HTMLButtonElement;
    expect(final.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    await waitFor(() => expect(resolveBlob).toBeDefined());
    expect(screen.queryByLabelText(checkbox)).toBeNull();
    resolveBlob(new Blob(["xlsx"]));
    const consent = await screen.findByLabelText(checkbox) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    expect(m.download).toHaveBeenCalledOnce();
    expect(final.disabled).toBe(true);
    expect(m.api.mock.calls.some(([, opts]) => opts.method === "DELETE")).toBe(false);
  });
  it("failed export never enables backup consent or deletion", async () => {
    m.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "فشل التصدير" }) });
    await mount(); fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    await screen.findByText("فشل التصدير");
    expect(screen.queryByLabelText(checkbox)).toBeNull();
    expect((screen.getByRole("button", { name: "حذف 42 سجل نهائياً" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("requires consent, password, successful server code verification and explicit final click", async () => {
    await exported();
    const final = screen.getByRole("button", { name: "حذف 42 سجل نهائياً" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("سبب الحذف النهائي"), { target: { value: "سبب معتمد للحذف" } });
    fireEvent.click(screen.getByLabelText(checkbox));
    fireEvent.change(screen.getByLabelText("كلمة مرور المسؤول الأعلى"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الهوية" }));
    await screen.findByText("تم تأكيد الهوية. صالح لمدة خمس دقائق.");
    fireEvent.change(screen.getByLabelText("رمز الحذف"), { target: { value: "A1B2C3D4" } });
    expect(final.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "التحقق من رمز الحذف" }));
    await screen.findByText("تم التحقق من رمز الحذف على الخادم.");
    await waitFor(() => expect(final.disabled).toBe(false));
    expect(m.api.mock.calls.some(([, opts]) => opts.method === "DELETE")).toBe(false);
    fireEvent.click(final);
    await waitFor(() => expect(m.deleted).toHaveBeenCalledOnce());
    const deletion = m.api.mock.calls.find(([, opts]) => opts.method === "DELETE")!;
    expect(JSON.parse(deletion[1].body)).toEqual({ snapshotId, backupConfirmed: true, receipt: "a".repeat(64), code: "A1B2C3D4", reason: "سبب معتمد للحذف" });
  });
  it("wrong code and changed snapshots leave deletion blocked", async () => {
    await exported();
    fireEvent.click(screen.getByLabelText(checkbox));
    fireEvent.change(screen.getByLabelText("كلمة مرور المسؤول الأعلى"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الهوية" }));
    await screen.findByText("تم تأكيد الهوية. صالح لمدة خمس دقائق.");
    fireEvent.change(screen.getByLabelText("رمز الحذف"), { target: { value: "00000000" } });
    m.api.mockRejectedValueOnce(new ApiError("رمز الحذف غير صحيح", 400, {}));
    fireEvent.click(screen.getByRole("button", { name: "التحقق من رمز الحذف" }));
    await screen.findByText("رمز الحذف غير صحيح");
    expect((screen.getByRole("button", { name: "حذف 42 سجل نهائياً" }) as HTMLButtonElement).disabled).toBe(true);
    m.api.mockRejectedValueOnce(new ApiError("تغيرت السجلات", 409, {}));
    fireEvent.click(screen.getByRole("button", { name: "التحقق من رمز الحذف" }));
    await screen.findByText("أغلق النافذة وأعد تحديد السجلات وتصدير نسخة جديدة.");
    expect((screen.getByRole("button", { name: "تصدير إلى Excel" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("cancelling never deletes anything", async () => {
    await mount(); fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(m.close).toHaveBeenCalledOnce(); expect(m.deleted).not.toHaveBeenCalled();
    expect(m.api.mock.calls.some(([, opts]) => opts.method === "DELETE")).toBe(false);
  });
});
