"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { LeaderEditor, type TeamLeader } from "./leader-editor";
import type { Department } from "./department-editor";
export function TeamLeadersPage({ role }: { role: string }) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [active, setActive] = useState("");
  const [editing, setEditing] = useState<TeamLeader | null | undefined>();
  const [moving, setMoving] = useState<TeamLeader | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const writable = role !== "VIEWER";
  const leaders = useQuery({
    queryKey: ["team-leaders", q, department, active],
    queryFn: () =>
      api<TeamLeader[]>(
        `/api/admin/team-leaders?${new URLSearchParams({ q, department, active })}`,
      ),
  });
  const all = useQuery({
    queryKey: ["team-leaders"],
    queryFn: () => api<TeamLeader[]>("/api/admin/team-leaders"),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/api/admin/departments"),
  });
  const targets =
    all.data?.filter(
      (l) =>
        l.isActive &&
        l.id !== moving?.id &&
        l.departmentId === moving?.departmentId,
    ) || [];
  return (
    <>
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <h1 className="text-2xl font-bold">الليدرية</h1>
        {writable && (
          <Button onClick={() => setEditing(null)}>+ إضافة ليدر</Button>
        )}
      </div>
      <div className="panel mb-6 grid gap-4 p-5 md:grid-cols-3">
        <label>
          بحث
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="الاسم أو الرقم الوظيفي"
          />
        </label>
        <label>
          القسم
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">جميع الأقسام</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الحالة
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">جميع الليدرية</option>
            <option value="true">فعال</option>
            <option value="false">غير فعال</option>
          </select>
        </label>
      </div>
      {leaders.isPending && <p role="status">جارٍ تحميل الليدرية…</p>}
      {leaders.error && <p role="alert">{leaders.error.message}</p>}
      {departments.error && <p role="alert">{departments.error.message}</p>}
      {leaders.data?.length === 0 && (
        <p className="panel p-6">
          لا يوجد ليدر مطابق. أضف ليدراً أو عدّل البحث.
        </p>
      )}
      {!!leaders.data?.length && (
        <div className="panel overflow-x-auto">
          <table>
            <thead>
              <tr>
                {[
                  "الاسم",
                  "الرقم الوظيفي",
                  "القسم",
                  "الحالة",
                  "عدد الموظفين",
                  "الإجراءات",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaders.data.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.fullName}
                    <small className="muted block">{l.notes}</small>
                  </td>
                  <td>{l.employeeNumber || "—"}</td>
                  <td>{l.department?.name}</td>
                  <td>{l.isActive ? "فعال" : "غير فعال"}</td>
                  <td>{l._count?.employees || 0}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/employees?teamLeader=${l.id}`}
                        className="text-blue-600"
                      >
                        عرض الموظفين
                      </Link>
                      {writable && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => setEditing(l)}
                          >
                            تعديل / إيقاف
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setMoving(l)}
                          >
                            إعادة التعيين
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LeaderEditor
        key={editing?.id || "new"}
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
        leader={editing || undefined}
      />
      <Dialog
        open={!!moving}
        onOpenChange={(v) => {
          if (!v && !busy) setMoving(null);
        }}
        title={`إعادة تعيين موظفي ${moving?.fullName || "الليدر"}`}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const result = await api<{ count: number }>(
                `/api/admin/team-leaders/${moving!.id}/reassign`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    targetLeaderId: form.get("targetLeaderId"),
                    reason: form.get("reason"),
                    deactivateSource: form.get("deactivateSource") === "on",
                  }),
                },
              );
              await client.invalidateQueries();
              toast.success(
                `تم نقل ${result.count} موظف؛ نافذ في التقارير من يوم بغداد التالي`,
              );
              setMoving(null);
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            الليدر البديل
            <select name="targetLeaderId" required>
              <option value="">اختر ليدراً فعالاً</option>
              {targets.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName}
                </option>
              ))}
            </select>
          </label>
          {targets.length === 0 && (
            <p>لا يوجد بديل فعال في القسم. أضف ليدراً أولاً.</p>
          )}
          {all.error && <p role="alert">{all.error.message}</p>}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="deactivateSource" className="w-auto" />
            إيقاف الليدر السابق بعد النقل
          </label>
          <label>
            سبب إعادة التعيين
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <Button disabled={busy || targets.length === 0}>
            تأكيد إعادة التعيين
          </Button>
        </form>
      </Dialog>
    </>
  );
}
