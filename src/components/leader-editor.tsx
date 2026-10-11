"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import type { Department } from "./department-editor";
export type TeamLeader = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  departmentId: string;
  department?: { name: string };
  isActive: boolean;
  notes: string | null;
  _count?: { employees: number };
};
export function LeaderEditor({
  open,
  onOpenChange,
  leader,
  departmentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leader?: TeamLeader;
  departmentId?: string;
  onCreated?: (leader: TeamLeader) => void;
}) {
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Department[]>("/api/admin/departments"),
    enabled: open,
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
      title={leader ? "تعديل الليدر" : "إضافة ليدر"}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const row = await api<TeamLeader>(
              `/api/admin/team-leaders${leader ? `/${leader.id}` : ""}`,
              {
                method: leader ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...Object.fromEntries(form),
                  isActive: form.get("isActive") === "true",
                }),
              },
            );
            client.setQueryData<TeamLeader[]>(["team-leaders"], (old) =>
              old ? [...old.filter((l) => l.id !== row.id), row] : [row],
            );
            await Promise.all([
              client.invalidateQueries({ queryKey: ["team-leaders"] }),
              client.invalidateQueries({ queryKey: ["reports"] }),
              client.invalidateQueries({ queryKey: ["employees"] }),
            ]);
            if (!leader) onCreated?.(row);
            toast.success("تم حفظ الليدر");
            onOpenChange(false);
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          الاسم الكامل
          <input
            name="fullName"
            defaultValue={leader?.fullName}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          الرقم الوظيفي (اختياري)
          <input
            name="employeeNumber"
            defaultValue={leader?.employeeNumber || ""}
            maxLength={40}
          />
        </label>
        <label>
          القسم
          <select
            name="departmentId"
            defaultValue={leader?.departmentId || departmentId || ""}
            required
            disabled={departments.isPending || !!departments.error}
          >
            <option value="">اختر القسم</option>
            {departments.data
              ?.filter(
                (d) =>
                  d.isActive &&
                  (!onCreated || !departmentId || d.id === departmentId),
              )
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        {departments.error && <p role="alert">{departments.error.message}</p>}
        {!departments.isPending &&
          !departments.data?.some((d) => d.isActive) && (
            <p>لا توجد أقسام فعالة؛ أضف قسماً أولاً.</p>
          )}
        <label>
          الحالة
          <select
            name="isActive"
            defaultValue={String(leader?.isActive ?? true)}
          >
            <option value="true">فعال</option>
            {!onCreated && <option value="false">غير فعال</option>}
          </select>
        </label>
        <label>
          ملاحظات
          <textarea
            name="notes"
            defaultValue={leader?.notes || ""}
            maxLength={2000}
          />
        </label>
        {!!leader?._count?.employees && (
          <p className="muted text-sm">
            إيقاف الليدر لا يمسح التعيينات. استخدم إعادة التعيين لنقل موظفيه إلى
            ليدر فعال.
          </p>
        )}
        <label>
          سبب التغيير
          <input name="reason" required minLength={5} maxLength={500} />
        </label>
        <Button disabled={busy || departments.isPending || !!departments.error}>
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </form>
    </Dialog>
  );
}
