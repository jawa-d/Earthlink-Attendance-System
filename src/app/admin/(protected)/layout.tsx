import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";
import { isLocalAdminPreview } from "@/lib/preview";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isLocalAdminPreview())
    return (
      <AdminShell preview admin={{ name: "معاينة محلية", role: "SUPER_ADMIN" }}>
        <div
          role="status"
          data-admin-preview="true"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          معاينة محلية بدون تسجيل دخول. البيانات والحفظ غير متاحين حتى إعداد
          قاعدة البيانات.
        </div>
        {children}
      </AdminShell>
    );
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <AdminShell admin={{ name: admin.name, role: admin.role }}>
      {children}
    </AdminShell>
  );
}
