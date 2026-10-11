import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      mocks.transaction(() =>
        fn({
          $queryRaw: mocks.query,
          employee: { findUnique: mocks.findUnique, update: mocks.update },
          attendanceRecord: {
            findFirst: mocks.findFirst,
            create: mocks.create,
          },
        }),
      ),
  },
}));
import { registerAttendance } from "../src/lib/service";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "r", ...data }),
  );
});
describe("public check-in service", () => {
  it("permits only one registration when competing transactions are serialized by the employee lock", async () => {
    let tail = Promise.resolve();
    let last: Date | null = null;
    mocks.transaction.mockImplementation((fn: () => Promise<unknown>) => {
      const next = tail.then(fn);
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    });
    mocks.findUnique.mockImplementation(async () => ({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
      lastSuccessfulAttendanceAt: last,
    }));
    mocks.update.mockImplementation(async ({ data }) => {
      last = data.lastSuccessfulAttendanceAt;
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        registerAttendance("a@earthlink.iq", new Date("2026-10-11T00:00:00Z")),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(11);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("uses original legacy QR timestamps during rolling deployment and does not ignore soft-deleted events", async () => {
    const last = new Date("2026-10-11T20:00:00Z");
    mocks.findUnique.mockResolvedValue({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
      lastSuccessfulAttendanceAt: null,
    });
    mocks.findFirst.mockResolvedValue({
      originalCheckInAt: last,
      createdAt: last,
    });
    await expect(
      registerAttendance("a@earthlink.iq", new Date("2026-10-11T21:00:00Z")),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      "deletedAt",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
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
    mocks.findUnique.mockResolvedValue({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
      lastSuccessfulAttendanceAt: new Date(),
    });
    await expect(registerAttendance("a@earthlink.iq")).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([0, 35_999_000, 36_000_000, 36_001_000])(
    "enforces the exact rolling boundary at %s milliseconds",
    async (elapsed) => {
      const last = new Date("2026-10-11T20:00:00Z");
      const now = new Date(last.getTime() + elapsed);
      mocks.findUnique.mockResolvedValue({
        id: "e",
        status: "ACTIVE",
        deletedAt: null,
        lastSuccessfulAttendanceAt: last,
      });
      if (elapsed < 36_000_000) {
        await expect(
          registerAttendance("a@earthlink.iq", now),
        ).rejects.toMatchObject({
          status: 409,
          times: {
            nextAllowedAt: "2026-10-12T06:00:00.000Z",
            serverNow: now.toISOString(),
          },
        });
        expect(mocks.create).not.toHaveBeenCalled();
      } else {
        await registerAttendance("a@earthlink.iq", now);
        expect(mocks.create).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith({
          where: { id: "e" },
          data: { lastSuccessfulAttendanceAt: now },
        });
      }
    },
  );
  it("allows two events on the same Baghdad date when ten hours have passed", async () => {
    const last = new Date("2026-10-11T00:00:00Z");
    mocks.findUnique.mockResolvedValue({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
      lastSuccessfulAttendanceAt: last,
    });
    await registerAttendance(
      "a@earthlink.iq",
      new Date("2026-10-11T10:00:00Z"),
    );
    expect(
      mocks.create.mock.calls[0][0].data.attendanceDate.toISOString(),
    ).toBe("2026-10-11T00:00:00.000Z");
    expect(mocks.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      "attendanceDate",
    );
  });
  it("stores an immutable registration timestamp independently of editable check-in fields", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "e",
      status: "ACTIVE",
      deletedAt: null,
    });
    const now = new Date("2026-10-11T06:00:00Z");
    await registerAttendance("a@earthlink.iq", now);
    expect(mocks.create.mock.calls[0][0].data.registeredAt).toEqual(now);
    expect(mocks.query).toHaveBeenCalledBefore(mocks.findUnique);
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
