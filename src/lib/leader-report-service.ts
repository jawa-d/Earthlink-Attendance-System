import { z } from "zod";
import { db } from "./db";
import { buildLeaderReport } from "./leader-report";
import { businessDate, dateValue } from "./validation";
import { HttpError } from "./http";
export async function getLeaderReport(p: URLSearchParams) {
  const start = dateValue(p.get("start") || businessDate());
  const end = dateValue(p.get("end") || p.get("start") || businessDate());
  if (
    end < start ||
    end.getTime() - start.getTime() > 366 * 86400000 ||
    end > dateValue(businessDate())
  )
    throw new HttpError(400, "اختر فترة لا تتجاوز سنة وتنتهي اليوم أو قبله");
  const department = p.get("department")
    ? z.uuid().parse(p.get("department"))
    : undefined;
  const teamLeader =
    p.get("teamLeader") === "unassigned"
      ? "unassigned"
      : p.get("teamLeader")
        ? z.uuid().parse(p.get("teamLeader"))
        : undefined;
  const status = p.get("status")
    ? z
        .enum([
          "PRESENT",
          "LATE",
          "ABSENT",
          "EXCUSED",
          "UNREGISTERED",
          "HISTORY_UNKNOWN",
        ])
        .parse(p.get("status"))
    : undefined;
  const q = (p.get("q") || "").slice(0, 120);
  const [employees, leaders] = await Promise.all([
    db.employee.findMany({
      where: {
        ...(p.get("employee") ? { id: z.uuid().parse(p.get("employee")) } : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" as const } },
                {
                  normalizedEmail: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        department: true,
        assignments: {
          where: { effectiveFrom: { lte: end } },
          orderBy: { effectiveFrom: "asc" },
        },
        attendance: {
          where: { deletedAt: null, attendanceDate: { gte: start, lte: end } },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    db.teamLeader.findMany({
      select: { id: true, fullName: true, departmentId: true },
    }),
  ]);
  return buildLeaderReport(employees, leaders, start, end, {
    department,
    teamLeader,
    status,
  });
}
