import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  authorize: vi.fn(),


  
  count: vi.fn(),
  records: vi.fn(),
  departments: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authorize: m.authorize }));
vi.mock("@/lib/db", () => ({
  db: {
    employee: { count: m.count },
    attendanceRecord: { findMany: m.records },
    department: { findMany: m.departments },
  },
}));
import { GET } from "../src/app/api/admin/[resource]/route";
const date = new Date("2026-10-11T00:00:00Z");
const active = { status: "ACTIVE", deletedAt: null };
const events = [
  {
    id: "a",
    employeeId: "employee",
    attendanceDate: date,
    employee: active,
    status: "PRESENT",
    registrationMethod: "QR",
    checkInAt: date,
  },
  {
    id: "b",
    employeeId: "employee",
    attendanceDate: date,
    employee: active,
    status: "LATE",
    registrationMethod: "QR",
    checkInAt: new Date(date.getTime() + 36000000),
  },
  {
    id: "c",
    employeeId: "absent",
    attendanceDate: date,
    employee: active,
    status: "ABSENT",
    registrationMethod: "ADMIN",
    checkInAt: null,
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  m.authorize.mockResolvedValue({ role: "ADMIN" });
  m.count.mockResolvedValue(3);
  m.records
    .mockResolvedValueOnce(events)
    .mockResolvedValueOnce([{ employeeId: "employee", attendanceDate: date }])
    .mockResolvedValueOnce([{ employeeId: "employee", attendanceDate: date }]);
  m.departments.mockResolvedValue([
    {
      name: "مركز الاتصال",
      employees: [
        { attendance: events.slice(0, 2) },
        { attendance: events.slice(2) },
      ],
    },
  ]);
});
describe("daily dashboard employee counts", () => {
  it("counts multiple events once across cards, trends, month and department metrics", async () => {
    const response = await GET(
      new Request(
        "https://attendance.example/api/admin/dashboard?date=2026-10-11",
      ),
      { params: Promise.resolve({ resource: "dashboard" }) },
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      employees: 3,
      registered: 1,
      unregistered: 1,
      counts: { PRESENT: 1, LATE: 0, ABSENT: 1, EXCUSED: 0 },
      trends: [{ date: "10-11", total: 1 }],
      departments: [{ name: "مركز الاتصال", total: 1 }],
    });
    expect(data.monthly[9].total).toBe(1);
    expect(m.records.mock.calls[1][0].distinct).toEqual([
      "employeeId",
      "attendanceDate",
    ]);
    expect(m.records.mock.calls[2][0].distinct).toEqual([
      "employeeId",
      "attendanceDate",
    ]);
    expect(data.rows).toHaveLength(3);
  });
});
