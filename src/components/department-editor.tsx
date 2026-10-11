"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export type Department = {
  id: string;
  name: string;
  englishName: string | null;
  code: string | null;
  isActive: boolean;
  _count?: { employees: number };
};
export function DepartmentEditor({
  open,
  onOpenChange,
  department,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: Department;
  onCreated?: (department: Department) => void;
}) {
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
      title={department ? "تعديل القسم" : "إضافة قسم"}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const row = await api<Department>(
              `/api/admin/departments${department ? `/${department.id}` : ""}`,
              {
                method: department ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...Object.fromEntries(form),
                  isActive: form.get("isActive") === "true",
                }),
              },
            );
            // Update all-department choices immediately, then refresh the persisted data.
            client.setQueryData<Department[]>(["departments"], (old) =>
              old ? [...old.filter((d) => d.id !== row.id), row] : [row],
            );
            await client.invalidateQueries({ queryKey: ["departments"] });
            if (!department) onCreated?.(row);
            toast.success("تم حفظ القسم");
            onOpenChange(false);
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          الاسم بالعربية
          <input
            name="name"
            defaultValue={department?.name}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          الاسم بالإنجليزية (اختياري)
          <input
            name="englishName"
            defaultValue={department?.englishName || ""}
            maxLength={120}
            dir="ltr"
          />
        </label>
        <label>
          رمز القسم
          <input
            name="code"
            defaultValue={department?.code || ""}
            required
            pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
            maxLength={64}
            dir="ltr"
          />
        </label>
        <label>
          الحالة
          <select
            name="isActive"
            defaultValue={String(department?.isActive ?? true)}
          >
            <option value="true">فعال</option>
            {!onCreated && <option value="false">غير فعال</option>}
          </select>
        </label>
        <label>
          سبب التغيير
          <input name="reason" required minLength={5} maxLength={500} />
        </label>
        <Button disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
      </form>
    </Dialog>
  );
}
