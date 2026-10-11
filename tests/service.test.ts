import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: mocks.query,
        employee: { findUnique: mocks.findUnique },
        attendanceRecord: { findFirst: mocks.findFirst, create: mocks.create },
      }),
  },
}));
import { registerAttendance } from "../src/lib/service";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "r", ...data }),
  );
});
describe("public check-in service", () => {
  it.each([
    null,
    { id: "e", status: "INACTIVE", deletedAt: null },
    { id: "e", status: "ACTIVE", deletedAt: new Date() },
  ])("rejects unavailable employees generically", async (employee) => {
    mocks.findUnique.mockResolvedValue(employee);
    await expect(registerAttendance("a@earthlink.iq")).rejects.toMatchObject({
      status: 403,
      message: "تعذر تسجيل الحضور. يرجى التواصل مع مسؤول القسم.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate attendance", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
    });
    mocks.findFirst.mockResolvedValue({ id: "prior" });
    await expect(registerAttendance("a@earthlink.iq")).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses server time, Baghdad date, QR method and PRESENT status", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "e",
      fullName: "Test",
      normalizedEmail: "a@earthlink.iq",
      status: "ACTIVE",
      deletedAt: null,
    });
    const now = new Date("2026-10-10T21:01:00Z");
    await registerAttendance("a@earthlink.iq", now);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attendanceDate: new Date("2026-10-11T00:00:00Z"),
        checkInAt: now,
        originalCheckInAt: now,
        status: "PRESENT",
        registrationMethod: "QR",
      }),
    });
  });
});
