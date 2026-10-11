"use client";
import { Button } from "./ui/button";
import { statusNames } from "@/lib/export-labels";
export type Row = {
  id: string;
  employeeNumber?: string;
  fullName?: string;
  normalizedEmail?: string;
  departmentId?: string;
  department?: { name: string };
  status?: string;
  employeeId?: string;
  employee?: Row;
  attendanceDate?: string;
  checkInAt?: string | null;
  deletedAt?: string | null;
  registrationMethod?: string;
  reason?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
  actorAdmin?: { name: string };
  role?: string;
  isActive?: boolean;
  name?: string;
  email?: string;
};
export function RecordsTable({
  rows,
  kind,
  onEdit,
  onDelete,
  onRestore,
  onView,
}: {
  rows: Row[];
  kind: string;
  onEdit?: (r: Row) => void;
  onDelete?: (r: Row) => void;
  onRestore?: (r: Row) => void;
  onView?: (r: Row) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            {(kind === "audit-logs"
              ? ["المسؤول", "العملية", "الكيان", "السبب", "الوقت"]
              : kind === "employees"
                ? [
                    "الرقم الوظيفي",
                    "الموظف",
                    "البريد الوظيفي",
                    "القسم",
                    "الحالة",
                    "الإجراءات",
                  ]
                : [
                    "الموظف",
                    "البريد الوظيفي",
                    "القسم",
                    "التاريخ",
                    "وقت الحضور",
                    "الحالة",
                    "الطريقة",
                    "الإجراءات",
                  ]
            ).map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = r.employee || r;
            return (
              <tr key={r.id}>
                {kind === "audit-logs" ? (
                  <>
                    <td>{r.actorAdmin?.name || "—"}</td>
                    <td>{r.action}</td>
                    <td>
                      {r.entityType}
                      <small className="muted block">{r.entityId}</small>
                    </td>
                    <td>{r.reason}</td>
                    <td>
                      {new Date(r.createdAt!).toLocaleString("ar-IQ", {
                        timeZone: "Asia/Baghdad",
                      })}
                    </td>
                  </>
                ) : (
                  <>
                    {kind === "employees" && <td>{e.employeeNumber}</td>}
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-600">
                          {e.fullName?.slice(0, 1)}
                        </span>
                        <span className="font-semibold">
                          {e.fullName}
                          <small className="muted block font-normal">
                            {kind === "employees" ? "" : e.employeeNumber}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td dir="ltr" className="text-slate-500">
                      {e.normalizedEmail}
                    </td>
                    <td>{e.department?.name}</td>
                    {kind !== "employees" && (
                      <>
                        <td>{r.attendanceDate?.slice(0, 10)}</td>
                        <td>
                          {r.checkInAt
                            ? new Date(r.checkInAt).toLocaleTimeString(
                                "en-GB",
                                { timeZone: "Asia/Baghdad" },
                              )
                            : "—"}
                        </td>
                      </>
                    )}
                    <td>
                      <span className={`badge ${r.status}`}>
                        {statusNames[r.status || ""] || r.status}
                      </span>
                      {r.deletedAt && (
                        <span className="badge ABSENT">محذوف</span>
                      )}
                    </td>
                    {kind !== "employees" && (
                      <td>
                        <span className="badge">
                          {r.registrationMethod || "—"}
                        </span>
                      </td>
                    )}
                    <td>
                      <div className="flex gap-2">
                        {onView && (
                          <Button
                            variant="outline"
                            className="px-2 py-1 text-[10px]"
                            onClick={() => onView(r)}
                          >
                            عرض
                          </Button>
                        )}
                        {onEdit && !r.deletedAt && (
                          <Button
                            variant="outline"
                            className="px-2 py-1 text-[10px]"
                            onClick={() => onEdit(r)}
                          >
                            تعديل
                          </Button>
                        )}
                        {onDelete && !r.deletedAt && r.status!=='UNREGISTERED' && (
                          <button
                            className="text-[10px] text-red-500"
                            onClick={() => onDelete(r)}
                          >
                            حذف
                          </button>
                        )}
                        {onRestore && r.deletedAt && (
                          <button
                            onClick={() => onRestore(r)}
                            className="text-blue-600"
                          >
                            استعادة
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <div className="muted p-12 text-center">لا توجد سجلات تطابق البحث</div>
      )}
    </div>
  );
}
