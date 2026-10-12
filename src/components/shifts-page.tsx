"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { shiftChoiceLabel, type ShiftChoice } from "@/lib/shift-display";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { toast } from "sonner";
type Shift = ShiftChoice & {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  departments: {
    departmentId: string;
    department: { id: string; name: string };
  }[];
};
export type ShiftList = {
  rows: Shift[];
  total: number;
  page: number;
  attendanceEnabled: boolean;
};
export function ShiftsPage({ role }: { role: string }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Shift | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canWrite = role === "ADMIN" || role === "SUPER_ADMIN";
  const params = new URLSearchParams({
    q,
    active,
    department,
    page: String(page),
  });
  const shifts = useQuery({
    queryKey: ["shifts", params.toString()],
    queryFn: () => api<ShiftList>(`/api/admin/shifts?${params}`),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      api<{ id: string; name: string }[]>("/api/admin/departments"),
  });
  function open(row: Shift | null) {
    setError("");
    setEditing(row);
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">الشفتات</h1>
          <p className="muted mt-2 text-sm">
            أوقات العمل بتوقيت بغداد؛ الشفت الليلي ينتهي في اليوم التالي.
          </p>
        </div>
        {canWrite && <Button onClick={() => open(null)}>+ إضافة شفت</Button>}
      </div>
      <div className="panel mb-6 grid gap-4 p-5 md:grid-cols-3">
        <label>
          بحث
          <input
            placeholder="رمز الشفت أو الاسم"
            maxLength={120}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          الحالة
          <select
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">جميع الشفتات</option>
            <option value="true">فعال</option>
            <option value="false">غير فعال</option>
          </select>
        </label>
        <label>
          القسم
          <select
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
        </label>
      </div>
      {shifts.isPending && <p role="status">جارٍ تحميل الشفتات…</p>}
      {shifts.error && (
        <div role="alert">
          <p>{shifts.error.message}</p>
          <Button variant="outline" onClick={() => shifts.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      )}
      {shifts.data && (
        <section className="panel overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>الشفت / الأوقات</th>
                <th>الأقسام المسموحة</th>
                <th>الحالة</th>
                <th>آخر تحديث</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {shifts.data.rows.map((s) => (
                <tr key={s.id}>
                  <td>{shiftChoiceLabel(s)}</td>
                  <td>
                    {s.departments.length
                      ? s.departments.map((d) => d.department.name).join("، ")
                      : "جميع الأقسام"}
                  </td>
                  <td>{s.isActive ? "فعال" : "غير فعال"}</td>
                  <td>
                    {new Date(s.updatedAt).toLocaleDateString("ar-IQ", {
                      timeZone: "Asia/Baghdad",
                    })}
                  </td>
                  <td>
                    {canWrite ? (
                      <Button variant="outline" onClick={() => open(s)}>
                        تعديل / تغيير الحالة
                      </Button>
                    ) : (
                      "للقراءة فقط"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shifts.data.rows.length && (
            <p className="p-6">لا توجد شفتات مطابقة.</p>
          )}
          <div className="flex items-center justify-between p-5">
            <span>
              صفحة {page} من {Math.max(1, Math.ceil(shifts.data.total / 25))}
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
                disabled={page * 25 >= shifts.data.total}
                onClick={() => setPage(page + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </section>
      )}
      <p className="muted mt-4 text-sm">
        تعديل الشفت أو إيقافه لا يغيّر تفاصيل الحضور المسجلة سابقاً.
      </p>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v && !busy) setEditing(undefined);
        }}
        title={editing ? "تعديل الشفت" : "إضافة شفت"}
      >
        <form
          key={editing?.id || "new"}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api(`/api/admin/shifts${editing ? `/${editing.id}` : ""}`, {
                method: editing ? "PATCH" : "POST",
                body: JSON.stringify({
                  code: form.get("code"),
                  name: form.get("name"),
                  startTime: form.get("startTime"),
                  endTime: form.get("endTime"),
                  isActive: form.get("isActive") === "true",
                  departmentIds: form.getAll("departmentIds"),
                  reason: form.get("reason"),
                }),
              });
              await client.invalidateQueries({ queryKey: ["shifts"] });
              toast.success("تم حفظ الشفت");
              setEditing(undefined);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            رمز الشفت
            <input
              name="code"
              dir="ltr"
              defaultValue={editing?.code || ""}
              required
              maxLength={20}
              pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,19}"
              placeholder="S02"
            />
          </label>
          <label>
            اسم الشفت بالعربية
            <input
              name="name"
              defaultValue={editing?.name || ""}
              required
              minLength={2}
              maxLength={120}
              placeholder="الشفت المسائي"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              البداية (بغداد)
              <input
                type="time"
                name="startTime"
                required
                defaultValue={editing?.startTime || ""}
              />
            </label>
            <label>
              النهاية (بغداد)
              <input
                type="time"
                name="endTime"
                required
                defaultValue={editing?.endTime || ""}
              />
            </label>
          </div>
          <p className="muted text-xs">
            إذا كانت النهاية قبل البداية، ينتهي الشفت في اليوم التالي. الوقتان
            المتساويان غير مسموحين.
          </p>
          <label>
            الحالة
            <select
              name="isActive"
              defaultValue={editing?.isActive === false ? "false" : "true"}
            >
              <option value="true">فعال</option>
              <option value="false">غير فعال</option>
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              تقييد الأقسام (اختياري)
            </legend>
            <p className="muted mb-2 text-xs">
              بدون تحديد أقسام: الشفت متاح لجميع الأقسام.
            </p>
            {departments.isPending && <p role="status">جارٍ تحميل الأقسام…</p>}
            {departments.error && (
              <p role="alert">تعذر تحميل الأقسام. أعد المحاولة قبل الحفظ.</p>
            )}
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {departments.data?.map((d) => (
                <label key={d.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="departmentIds"
                    value={d.id}
                    className="w-auto"
                    defaultChecked={editing?.departments.some(
                      (x) => x.departmentId === d.id,
                    )}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            سبب التغيير
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            disabled={busy || departments.isPending || !!departments.error}
          >
            {busy ? "جارٍ الحفظ…" : "حفظ الشفت"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
