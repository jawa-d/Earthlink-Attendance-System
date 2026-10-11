"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { DepartmentEditor, type Department } from "./department-editor";
import { Button } from "./ui/button";
export function DepartmentsPage({ role }: { role: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [editing, setEditing] = useState<Department | null | undefined>();
  const departments = useQuery({
    queryKey: ["departments", q, active],
    queryFn: () =>
      api<Department[]>(
        `/api/admin/departments?${new URLSearchParams({ q, active })}`,
      ),
  });
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">الأقسام</h1>
        {role === "SUPER_ADMIN" && (
          <Button onClick={() => setEditing(null)}>+ إضافة قسم</Button>
        )}
      </div>
      <div className="panel mb-6 grid gap-4 p-5 md:grid-cols-2">
        <label>
          بحث
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اسم القسم أو الرمز"
          />
        </label>
        <label>
          الحالة
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">جميع الأقسام</option>
            <option value="true">فعال</option>
            <option value="false">غير فعال</option>
          </select>
        </label>
      </div>
      {departments.isPending && <p role="status">جارٍ تحميل الأقسام…</p>}
      {departments.error && (
        <div role="alert">
          <p>{departments.error.message}</p>
          <Button onClick={() => departments.refetch()}>إعادة المحاولة</Button>
        </div>
      )}
      {departments.data?.length === 0 && (
        <p className="panel p-6">
          لا توجد أقسام مطابقة. أضف قسماً أو غيّر عوامل البحث.
        </p>
      )}
      {!!departments.data?.length && (
        <div className="panel overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>القسم</th>
                <th>الرمز</th>
                <th>الحالة</th>
                <th>عدد الموظفين</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {departments.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name}
                    <small className="muted block">{d.englishName}</small>
                  </td>
                  <td dir="ltr">{d.code || "—"}</td>
                  <td>{d.isActive ? "فعال" : "غير فعال"}</td>
                  <td>{d._count?.employees ?? 0}</td>
                  <td>
                    {role === "SUPER_ADMIN" ? (
                      <Button variant="outline" onClick={() => setEditing(d)}>
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
        </div>
      )}
      <p className="muted mt-4 text-sm">
        إيقاف القسم يحافظ على الموظفين وسجل الحضور. عدد الموظفين يشمل السجلات
        التاريخية.
      </p>
      <DepartmentEditor
        key={editing?.id || "new"}
        open={editing !== undefined}
        department={editing || undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
      />
    </>
  );
}
