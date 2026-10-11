"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Search, Download, Upload, Filter } from "lucide-react";
import { api } from "@/lib/client";
import { businessDate } from "@/lib/validation";
import { statusNames } from "@/lib/export-labels";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { RecordsTable, type Row } from "./records-table";
import { DepartmentEditor, type Department } from "./department-editor";
import { LeaderEditor, type TeamLeader } from "./leader-editor";
import type { LeaderGroup } from "@/lib/leader-report";
type List = {
  rows: Row[];
  total: number;
  page: number;
  groups?: LeaderGroup[];
  historyIncomplete?: boolean;
};
type FormValues = {
  employeeNumber: string;
  fullName: string;
  normalizedEmail: string;
  departmentId: string;
  teamLeaderId: string;
  status: string;
  employeeId: string;
  attendanceDate: string;
  time: string;
  reason: string;
};
const titles: Record<string, string> = {
  employees: "دليل الموظفين",
  attendance: "سجل الحضور",
  reports: "التقارير والإحصائيات",
  "audit-logs": "سجل العمليات",
};
export function Management({
  kind,
  role,
  initialTeamLeader = "",
}: {
  kind: string;
  role: string;
  initialTeamLeader?: string;
}) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [teamLeader, setTeamLeader] = useState(initialTeamLeader);
  const [addingLeader, setAddingLeader] = useState(false);
  const [employee, setEmployee] = useState("");
  const [sort, setSort] = useState("fullName");
  const [start, setStart] = useState(businessDate());
  const [end, setEnd] = useState(businessDate());
  const [page, setPage] = useState(1);
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ row: Row; restore: boolean } | null>(
    null,
  );
  const [view, setView] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingDepartment, setAddingDepartment] = useState(false);
  const { register, reset, handleSubmit, setValue, control } =
    useForm<FormValues>();
  const selectedDepartment = useWatch({ control, name: "departmentId" }) || "";
  const selectedLeader = useWatch({ control, name: "teamLeaderId" }) || "";
  const selectedStatus = useWatch({ control, name: "status" });
  const writable =
    role !== "VIEWER" && kind !== "reports" && kind !== "audit-logs";
  const params = new URLSearchParams({
    q,
    status,
    department,
    ...(kind === "attendance" ? { teamLeaderId: teamLeader } : { teamLeader }),
    employee,
    sort,
    page: String(page),
    start,
    end,
    deleted: String(deleted),
  });
  const query = useQuery({
    queryKey: [kind, params.toString()],
    queryFn: () =>
      api<List>(
        `/api/admin/${kind === "reports" ? "team-leader-reports" : kind}?${params}`,
      ),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/api/admin/departments"),
  });
  const activeDepartments = departments.data?.filter((d) => d.isActive) || [];
  const leaders = useQuery({
    queryKey: ["team-leaders"],
    queryFn: () => api<TeamLeader[]>("/api/admin/team-leaders"),
    enabled: ["employees", "reports", "attendance"].includes(kind),
  });
  const availableLeaders =
    leaders.data?.filter(
      (l) => l.isActive && l.departmentId === selectedDepartment,
    ) || [];
  const leaderRequired =
    selectedStatus === "ACTIVE" &&
    !!leaders.data?.some((l) => l.departmentId === selectedDepartment);
  const choices = useQuery({
    queryKey: ["employee-choices"],
    queryFn: async () => {
      const all: Row[] = [];
      for (let p = 1; p <= 20; p++) {
        const data = await api<List>(`/api/admin/employees?page=${p}`);
        all.push(...data.rows);
        if (all.length >= data.total) break;
      }
      return all;
    },
    enabled: kind === "attendance" || kind === "reports",
  });
  const history = useQuery({
    queryKey: ["history", view?.id],
    queryFn: () => api<List>(`/api/admin/history?entityId=${view?.id}`),
    enabled:
      !!view &&
      ["employees", "attendance", "reports"].includes(kind) &&
      view.status !== "UNREGISTERED" &&
      view.status !== "HISTORY_UNKNOWN",
  });
  const open = (r: Row | null) => {
    setEditing(r?.status === "UNREGISTERED" ? null : r);
    reset({
      employeeNumber: r?.employeeNumber || "",
      fullName: r?.fullName || "",
      normalizedEmail: r?.normalizedEmail || "",
      departmentId: r?.departmentId || activeDepartments[0]?.id || "",
      teamLeaderId:
        r?.teamLeader?.isActive === false ? "" : r?.teamLeaderId || "",
      employeeId:
        r?.employeeId || r?.employee?.id || choices.data?.[0]?.id || "",
      status:
        r?.status === "UNREGISTERED"
          ? "PRESENT"
          : r?.status || (kind === "employees" ? "ACTIVE" : "PRESENT"),
      attendanceDate: r?.attendanceDate?.slice(0, 10) || businessDate(),
      time: r?.checkInAt
        ? new Date(r.checkInAt).toLocaleTimeString("en-GB", {
            timeZone: "Asia/Baghdad",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      reason: "",
    });
  };
  const refresh = async () => {
    await client.invalidateQueries();
  };
  const exportUrl = (format: string) =>
    `/api/admin/export?${new URLSearchParams({ kind, format, start, end, status, department, employee, q, deleted: String(deleted), ...(kind === "attendance" ? { teamLeaderId: teamLeader } : { teamLeader }), ...(kind === "reports" ? { group: "team-leader" } : {}) })}`;
  return (
    <>
      <div className="mb-8 flex flex-wrap justify-between gap-4">
        <div>
          <p className="muted mb-2 text-xs">إدارة بيانات القسم</p>
          <h1 className="text-2xl font-bold">{titles[kind]}</h1>
          <p className="muted mt-3 text-xs">
            {query.data?.total ?? "—"} سجل • البيانات محفوظة في قاعدة البيانات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {kind !== "audit-logs" && (
            <>
              <a href={exportUrl("xlsx")}>
                <Button variant="outline">
                  <Download size={15} />
                  Excel
                </Button>
              </a>
              {kind !== "employees" && (
                <a href={exportUrl("pdf")}>
                  <Button variant="outline">
                    <Download size={15} />
                    PDF
                  </Button>
                </a>
              )}
            </>
          )}
          {kind === "employees" && writable && (
            <label className="m-0 cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-xs">
              <Upload size={14} className="ml-2 inline" />
              استيراد Excel
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const note = window.prompt(
                    "سبب استيراد الموظفين (5 أحرف على الأقل)",
                  );
                  if (!note) return;
                  const form = new FormData();
                  form.set("file", file);
                  form.set("reason", note);
                  try {
                    const result = await api<{ imported: number }>(
                      "/api/admin/export",
                      { method: "POST", body: form },
                    );
                    toast.success(`تم استيراد ${result.imported} موظف`);
                    await refresh();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {writable && (
            <Button onClick={() => open(null)}>
              <Plus size={17} />
              {kind === "employees" ? "إضافة موظف" : "إضافة سجل حضور"}
            </Button>
          )}
        </div>
      </div>
      {kind === "reports" && (
        <>
          <p className="muted mb-4 text-sm">
            الحضور يشمل PRESENT وLATE بوقت تسجيل. الغياب يشمل ABSENT وعدم
            التسجيل؛ بعذر مستقل. النسبة = أيام الحضور ÷ أيام الموظفين الفعالة.
            فلتر الحالة يخص التفاصيل؛ الملخص يحتفظ بالمقام الكامل. إعادة التعيين
            نافذة من يوم بغداد التالي.
          </p>
          {query.data?.historyIncomplete && (
            <p
              role="status"
              className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900"
            >
              بعض الأيام تسبق سجل التوظيف والتعيين المؤكد؛ لا نحتسب غياباً
              افتراضياً لها. الحضور المسجل محفوظ في التفاصيل.
            </p>
          )}
          {!!query.data?.groups?.length && (
            <div className="panel mb-6 overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    {[
                      "الليدر",
                      "الموظفون (فريدون)",
                      "أيام الموظفين",
                      "حضور",
                      "غياب / عدم تسجيل",
                      "بعذر",
                      "النسبة",
                      "أيام مجهولة",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.groups.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.totalAssignedActiveEmployees}</td>
                      <td>{g.employeeDays}</td>
                      <td>{g.present}</td>
                      <td>{g.absent}</td>
                      <td>{g.excused}</td>
                      <td>{g.percentage}%</td>
                      <td>{g.unknownEmployeeDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <div className="relative min-w-48 flex-1">
            <Search className="muted absolute right-3 top-3" size={17} />
            <input
              aria-label="البحث"
              className="pr-10"
              placeholder="ابحث بالاسم أو البريد الإلكتروني…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {kind !== "audit-logs" && (
            <>
              <select
                aria-label="القسم"
                className="max-w-44"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">جميع الأقسام</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="الحالة"
                className="max-w-44"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">جميع الحالات</option>
                {(kind === "employees"
                  ? ["ACTIVE", "INACTIVE"]
                  : ["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNREGISTERED"]
                ).map((s) => (
                  <option value={s} key={s}>
                    {statusNames[s]}
                  </option>
                ))}
              </select>
            </>
          )}
          {["employees", "reports", "attendance"].includes(kind) && (
            <select
              aria-label="الليدر المسؤول"
              value={teamLeader}
              className="max-w-44"
              onChange={(e) => {
                setTeamLeader(e.target.value);
                setPage(1);
              }}
            >
              <option value="">جميع الليدرية</option>
              <option value="unassigned">بدون ليدر</option>
              {leaders.data
                ?.filter((l) => kind === "attendance" || !department || l.departmentId === department)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.fullName}
                    {l.isActive ? "" : " (غير فعال)"}
                  </option>
                ))}
            </select>
          )}
          {kind === "employees" ? (
            <select
              aria-label="الترتيب"
              className="max-w-36"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="fullName">الاسم</option>
              <option value="employeeNumber">الرقم الوظيفي</option>
              <option value="createdAt">تاريخ الإضافة</option>
            </select>
          ) : (
            kind !== "audit-logs" && (
              <>
                <input
                  type="date"
                  aria-label="من تاريخ"
                  className="max-w-40"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setPage(1);
                  }}
                />
                <input
                  type="date"
                  aria-label="إلى تاريخ"
                  className="max-w-40"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label="الموظف"
                  className="max-w-44"
                  value={employee}
                  onChange={(e) => {
                    setEmployee(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">جميع الموظفين</option>
                  {choices.data?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
                {role === "SUPER_ADMIN" && kind === "attendance" && (
                  <label className="flex items-center gap-2">
                    <input
                      className="w-auto"
                      type="checkbox"
                      checked={deleted}
                      onChange={(e) => { setDeleted(e.target.checked); setPage(1); }}
                    />
                    المحذوفة
                  </label>
                )}
              </>
            )
          )}
          <Button variant="outline" onClick={() => query.refetch()}>
            <Filter size={15} />
            تحديث
          </Button>
        </div>
        {kind === "attendance" && leaders.isLoading && <p role="status" className="p-4">جارٍ تحميل الليدرية…</p>}
        {kind === "attendance" && leaders.isError && <p role="alert" className="p-4">تعذر تحميل الليدرية. <button onClick={() => leaders.refetch()}>إعادة المحاولة</button></p>}
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
        ) : query.error ? (
          <p role="alert" className="p-6 text-red-600">
            {query.error.message}
          </p>
        ) : (
          <RecordsTable
            rows={query.data?.rows || []}
            kind={kind === "reports" ? "attendance" : kind}
            onView={(r) => setView(r)}
            onEdit={writable ? (r) => open(r) : undefined}
            onDelete={
              writable
                ? (r) => {
                    setNote("");
                    setConfirm({ row: r, restore: false });
                  }
                : undefined
            }
            onRestore={
              role === "SUPER_ADMIN" && kind === "attendance"
                ? (r) => {
                    setNote("");
                    setConfirm({ row: r, restore: true });
                  }
                : undefined
            }
          />
        )}
        <div className="flex items-center justify-between p-5">
          <span className="muted text-xs">
            صفحة {page} من{" "}
            {Math.max(1, Math.ceil((query.data?.total || 0) / 25))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              disabled={page * 25 >= (query.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      </section>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
        title={editing ? "تعديل السجل" : "إضافة سجل"}
      >
        <form
          className="grid gap-4"
          onSubmit={handleSubmit(async (data) => {
            setBusy(true);
            try {
              const payload =
                kind === "employees"
                  ? data
                  : {
                      employeeId: data.employeeId,
                      attendanceDate: data.attendanceDate,
                      status: data.status,
                      reason: data.reason,
                      ...(editing &&
                      data.attendanceDate ===
                        editing.attendanceDate?.slice(0, 10) &&
                      data.time ===
                        (editing.checkInAt
                          ? new Date(editing.checkInAt).toLocaleTimeString(
                              "en-GB",
                              {
                                timeZone: "Asia/Baghdad",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )
                          : "")
                        ? {}
                        : {
                            checkInAt: data.time
                              ? `${data.attendanceDate}T${data.time}:00+03:00`
                              : null,
                          }),
                    };
              await api(
                `/api/admin/${kind}${editing ? `/${editing.id}` : ""}`,
                {
                  method: editing ? "PATCH" : "POST",
                  body: JSON.stringify(payload),
                },
              );
              toast.success("تم حفظ السجل");
              setEditing(undefined);
              await refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          })}
        >
          {kind === "employees" ? (
            <>
              <Field label="الرقم الوظيفي">
                <input required {...register("employeeNumber")} />
              </Field>
              <Field label="الاسم الكامل">
                <input required {...register("fullName")} />
              </Field>
              <Field label="البريد الوظيفي">
                <input
                  type="email"
                  dir="ltr"
                  required
                  {...register("normalizedEmail")}
                />
              </Field>
              <Field label="القسم">
                <select
                  required
                  disabled={departments.isPending || !!departments.error}
                  {...register("departmentId")}
                  value={selectedDepartment}
                  onChange={(e) => {
                    register("departmentId").onChange(e);
                    setValue("teamLeaderId", "", { shouldDirty: true });
                  }}
                >
                  <option value="">اختر القسم</option>
                  {activeDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              {departments.isPending && (
                <p role="status">جارٍ تحميل الأقسام…</p>
              )}
              {departments.error && (
                <p role="alert">
                  تعذر تحميل الأقسام: {departments.error.message}
                </p>
              )}
              {!departments.isPending &&
                !departments.error &&
                activeDepartments.length === 0 && (
                  <p role="status">
                    لا توجد أقسام فعالة. أضف قسماً أو تواصل مع مسؤول النظام.
                  </p>
                )}
              {role === "SUPER_ADMIN" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddingDepartment(true)}
                >
                  + إضافة قسم
                </Button>
              )}
              <Field label="الليدر المسؤول">
                <select
                  {...register("teamLeaderId")}
                  value={selectedLeader}
                  required={leaderRequired}
                  disabled={leaders.isPending || !!leaders.error}
                >
                  <option value="">
                    {leaderRequired ? "اختر الليدر المسؤول" : "بدون ليدر"}
                  </option>
                  {availableLeaders.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName}
                    </option>
                  ))}
                </select>
              </Field>
              {leaders.isPending && <p role="status">جارٍ تحميل الليدرية…</p>}
              {leaders.error && (
                <p role="alert">تعذر تحميل الليدرية: {leaders.error.message}</p>
              )}
              {!leaders.isPending && availableLeaders.length === 0 && (
                <p className="muted">
                  لا يوجد ليدر فعال في القسم المختار. أضف ليدراً أو تواصل مع
                  مسؤول النظام.
                </p>
              )}
              {role !== "VIEWER" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedDepartment}
                  onClick={() => setAddingLeader(true)}
                >
                  + إضافة ليدر
                </Button>
              )}
            </>
          ) : (
            <>
              <Field label="الموظف">
                <select required {...register("employeeId")}>
                  {choices.data?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="التاريخ">
                  <input type="date" required {...register("attendanceDate")} />
                </Field>
                <Field label="الوقت (بغداد)، اختياري">
                  <input type="time" {...register("time")} />
                </Field>
              </div>
            </>
          )}
          <Field label="الحالة">
            <select {...register("status")}>
              {(kind === "employees"
                ? ["ACTIVE", "INACTIVE"]
                : ["PRESENT", "LATE", "ABSENT", "EXCUSED"]
              ).map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="سبب التغيير">
            <textarea
              required
              minLength={5}
              maxLength={500}
              {...register("reason")}
            />
          </Field>
          <Button disabled={busy}>
            {busy ? "جاري الحفظ…" : "حفظ التغييرات"}
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={confirm?.restore ? "استعادة السجل" : "تأكيد الحذف"}
      >
        <p className="muted mb-5">
          سيتم الاحتفاظ بالتاريخ وسجل العمليات. أدخل سبب العملية.
        </p>
        <textarea
          aria-label="سبب العملية"
          minLength={5}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          disabled={busy || note.trim().length < 5}
          className="mt-5"
          variant={confirm?.restore ? "default" : "destructive"}
          onClick={async () => {
            if (!confirm) return;
            setBusy(true);
            try {
              await api(`/api/admin/${kind}/${confirm.row.id}`, {
                method: confirm.restore ? "PATCH" : "DELETE",
                body: JSON.stringify({
                  reason: note,
                  restore: confirm.restore,
                }),
              });
              toast.success("تم تنفيذ العملية");
              setConfirm(null);
              await refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          تأكيد
        </Button>
      </Dialog>
      <Dialog
        open={!!view}
        onOpenChange={(v) => {
          if (!v) setView(null);
        }}
        title="تفاصيل السجل"
      >
        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-5 text-sm dark:bg-slate-800">
          {[
            [
              "الاسم",
              view?.employee?.fullName ||
                view?.fullName ||
                view?.actorAdmin?.name,
            ],
            [
              "الرقم الوظيفي",
              view?.employee?.employeeNumber || view?.employeeNumber,
            ],
            [
              "البريد الوظيفي",
              view?.employee?.normalizedEmail || view?.normalizedEmail,
            ],
            [
              "القسم",
              view?.employee?.department?.name || view?.department?.name,
            ],
            ["الحالة", statusNames[view?.status || ""]],
            [
              "الليدر المسؤول",
              view?.teamLeaderName ||
                view?.employee?.teamLeader?.fullName ||
                view?.teamLeader?.fullName,
            ],
            ["تاريخ الحضور", view?.attendanceDate?.slice(0, 10)],
            [
              "وقت الحضور",
              view?.checkInAt
                ? new Date(view.checkInAt).toLocaleString("ar-IQ", {
                    timeZone: "Asia/Baghdad",
                  })
                : undefined,
            ],
            ["طريقة التسجيل", view?.registrationMethod],
            ["العملية", view?.action],
            ["السبب", view?.reason],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="muted mb-2 text-xs">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
        </dl>
        {["employees", "attendance", "reports"].includes(kind) &&
          view?.status !== "UNREGISTERED" &&
          view?.status !== "HISTORY_UNKNOWN" && (
            <>
              <h3 className="my-4 font-bold">سجل التعديلات</h3>
              {history.data?.rows.map((r) => (
                <p key={r.id} className="mb-3 text-xs">
                  {r.action} • {r.reason} • {r.actorAdmin?.name}
                </p>
              ))}
            </>
          )}
      </Dialog>
      <LeaderEditor
        key={selectedDepartment}
        open={addingLeader}
        onOpenChange={setAddingLeader}
        departmentId={selectedDepartment}
        onCreated={(l) =>
          setValue("teamLeaderId", l.id, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />
      <DepartmentEditor
        open={addingDepartment}
        onOpenChange={setAddingDepartment}
        onCreated={(d) => {
          setValue("teamLeaderId", "");
          setValue("departmentId", d.id, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      {label}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
