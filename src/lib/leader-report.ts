import { businessDate } from "./validation";
import { summarizeAttendanceDay } from "./attendance-summary";
import { matchesShift } from "./shifts";
import { shiftScheduleLabel, type ShiftHistory } from "./shift-display";
export type Assignment = {
  teamLeaderId: string | null;
  leaderName: string | null;
  departmentId: string;
  departmentName: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};
export type ReportEmployee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  normalizedEmail: string;
  departmentId: string;
  department: { name: string };
  createdAt: Date;
  deletedAt: Date | null;
  assignments: Assignment[];
  attendance: (ShiftHistory & {
    id: string;
    attendanceDate: Date;
    status: string;
    checkInAt: Date | null;
    registrationMethod: string;
  })[];
};
export type LeaderGroup = {
  id: string;
  name: string;
  totalAssignedActiveEmployees: number;
  employeeDays: number;
  present: number;
  absent: number;
  excused: number;
  percentage: number;
  unknownEmployeeDays: number;
};
export type LeaderReportRow = {
  shiftLabels?: string[];
  id: string;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    normalizedEmail: string;
    department: { name: string };
  };
  attendanceDate: Date;
  status: string;
  checkInAt: Date | null;
  firstCheckInAt: Date | null;
  lastCheckInAt: Date | null;
  eventCount: number;
  registrationMethod: string;
  teamLeaderId: string | null;
  teamLeaderName: string;
  eligible: boolean;
  historyUnknown: boolean;
};
export function assignmentOnDate(assignments: Assignment[], date: Date) {
  return assignments.find(
    (a) => a.effectiveFrom <= date && (!a.effectiveTo || a.effectiveTo > date),
  );
}
export function buildLeaderReport(
  employees: ReportEmployee[],
  leaders: { id: string; fullName: string; departmentId: string }[],
  start: Date,
  end: Date,
  filters: { department?: string; teamLeader?: string; status?: string; shift?: string } = {},
) {
  const groups = new Map<string, LeaderGroup>();
  const distinct = new Map<string, Set<string>>();
  const rows: LeaderReportRow[] = [];
  const group = (id: string | null, name: string) => {
    const key = id || "unassigned";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name,
        totalAssignedActiveEmployees: 0,
        employeeDays: 0,
        present: 0,
        absent: 0,
        excused: 0,
        percentage: 0,
        unknownEmployeeDays: 0,
      });
      distinct.set(key, new Set());
    }
    return groups.get(key)!;
  };
  for (const l of leaders)
    if (
      (!filters.department || l.departmentId === filters.department) &&
      (!filters.teamLeader || l.id === filters.teamLeader)
    )
      group(l.id, l.fullName);
  for (const employee of employees) {
    const recorded = new Map<string, ReportEmployee["attendance"]>();
    for (const record of employee.attendance) {
      if (!matchesShift(record, filters.shift)) continue;
      const key = record.attendanceDate.toISOString().slice(0, 10);
      recorded.set(key, [...(recorded.get(key) || []), record]);
    }
    for (
      let date = start;
      date <= end;
      date = new Date(date.getTime() + 86400000)
    ) {
      const day = date.toISOString().slice(0, 10);
      if (businessDate(employee.createdAt) > day) continue;
      const assignment = assignmentOnDate(employee.assignments, date);
      const daily = summarizeAttendanceDay(recorded.get(day) || []);
      const record = daily.representative;
      if (filters.shift && !record) continue;
      const departmentId = assignment?.departmentId || employee.departmentId;
      const teamLeaderId = assignment?.teamLeaderId || null;
      if (filters.department && departmentId !== filters.department) continue;
      if (
        filters.teamLeader &&
        (teamLeaderId || "unassigned") !== filters.teamLeader
      )
        continue;
      const historyUnknown = !assignment;
      const eligible = assignment?.status === "ACTIVE";
      if (!eligible && !historyUnknown && !record) continue;
      if (
        historyUnknown &&
        employee.deletedAt &&
        businessDate(employee.deletedAt) <= day &&
        !record
      )
        continue;
      const leaderName =
        assignment?.leaderName || "بدون ليدر / تاريخ غير متوفر";
      const summary = group(teamLeaderId, leaderName);
      const status =
        daily.status || (historyUnknown ? "HISTORY_UNKNOWN" : "UNREGISTERED");
      if (historyUnknown) summary.unknownEmployeeDays++;
      if (eligible) {
        summary.employeeDays++;
        distinct.get(summary.id)!.add(employee.id);
        if (daily.present) summary.present++;
        else if (record?.status === "EXCUSED") summary.excused++;
        else summary.absent++;
      }
      if (filters.status && status !== filters.status) continue;
      rows.push({
        shiftLabels: [...new Set((recorded.get(day) || []).map(shiftScheduleLabel))],
        id: record?.id || `${employee.id}-${day}`,
        employee: {
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          normalizedEmail: employee.normalizedEmail,
          department: {
            name: assignment?.departmentName || employee.department.name,
          },
        },
        attendanceDate: date,
        status,
        checkInAt: daily.firstCheckInAt,
        firstCheckInAt: daily.firstCheckInAt,
        lastCheckInAt: daily.lastCheckInAt,
        eventCount: daily.eventCount,
        registrationMethod: record?.registrationMethod || "—",
        teamLeaderId,
        teamLeaderName: leaderName,
        eligible: !!eligible,
        historyUnknown,
      });
    }
  }
  for (const value of groups.values()) {
    value.totalAssignedActiveEmployees = distinct.get(value.id)!.size;
    value.percentage = value.employeeDays
      ? Math.round((value.present / value.employeeDays) * 10000) / 100
      : 0;
  }
  rows.sort(
    (a, b) =>
      a.teamLeaderName.localeCompare(b.teamLeaderName, "ar") ||
      a.attendanceDate.getTime() - b.attendanceDate.getTime() ||
      a.employee.fullName.localeCompare(b.employee.fullName, "ar"),
  );
  return {
    rows,
    groups: [...groups.values()],
    historyIncomplete: [...groups.values()].some(
      (g) => g.unknownEmployeeDays > 0,
    ),
  };
}
