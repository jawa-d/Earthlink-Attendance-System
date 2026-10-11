"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserRoundCheck,
  CalendarCheck,
  ChartNoAxesCombined,
  QrCode,
  ScrollText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  UserRound,
  Bell,
} from "lucide-react";
import { api } from "@/lib/client";
import { ProjectCredits } from "./project-credits";
const links = [
  ["/admin", "لوحة التحكم", LayoutDashboard],
  ["/admin/employees", "الموظفون", Users],
  ["/admin/departments", "الأقسام", Building2],
  ["/admin/team-leaders", "الليدرية", UserRoundCheck],
  ["/admin/attendance", "سجل الحضور", CalendarCheck],
  ["/admin/reports", "التقارير والإحصائيات", ChartNoAxesCombined],
  ["/admin/qr", "رمز الحضور QR", QrCode],
  ["/admin/audit-logs", "سجل العمليات", ScrollText],
  ["/admin/settings", "الإعدادات", Settings],
] as const;
export function AdminShell({
  admin,
  children,
  preview = false,
}: {
  admin: { name: string; role: string };
  children: React.ReactNode;
  preview?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("theme") === "dark";
    queueMicrotask(() => setDark(value));
    document.documentElement.classList.toggle("dark", value);
  }, []);
  return (
    <div className="min-h-screen">
      <aside
        className={`no-print fixed inset-y-0 right-0 z-30 w-64 border-l border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 ${menu ? "block" : "hidden"} lg:block`}
      >
        <Link href="/admin" className="mb-10 flex items-center gap-3 px-2 pt-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#183153] text-white">
            <ChartNoAxesCombined size={24} />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight" dir="ltr">
              earthlink<span className="text-blue-600">.</span>
            </p>
            <p className="muted text-[10px]">نظام الحضور الداخلي</p>
          </div>
        </Link>
        <p className="muted mb-3 px-3 text-[10px]">القائمة الرئيسية</p>
        <nav className="space-y-2">
          {links
            .filter(
              ([url]) =>
                admin.role === "SUPER_ADMIN" ||
                !["/admin/audit-logs", "/admin/settings"].includes(url),
            )
            .filter(([url]) => admin.role !== "VIEWER" || url !== "/admin/qr")
            .map(([url, label, Icon]) => (
              <Link
                onClick={() => setMenu(false)}
                key={url}
                href={url}
                className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-[13px] ${pathname === url ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
              >
                <Icon size={19} />
                {label}
              </Link>
            ))}
        </nav>
        <div className="absolute bottom-6 left-5 right-5 border-t border-slate-100 pt-5 dark:border-slate-700">
          <Link href="/admin/profile" className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <UserRound size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold">{admin.name}</p>
              <p className="muted mt-1 text-[10px]">
                {preview ? "معاينة الواجهة" : admin.role}
              </p>
            </div>
          </Link>
          <button
            className="flex items-center gap-3 px-3 text-xs text-red-500"
            onClick={async () => {
              if (preview) {
                router.push("/attendance");
                return;
              }
              await api("/api/auth/logout", { method: "POST" });
              router.push("/admin/login");
              router.refresh();
            }}
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col lg:mr-64">
        <header className="no-print flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-900 md:px-9">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden"
              onClick={() => setMenu(!menu)}
              aria-label="فتح القائمة"
            >
              <Menu />
            </button>
            <span className="muted text-xs">
              مساحة الإدارة <span className="mx-3">/</span>{" "}
              <span className="text-slate-700 dark:text-white">
                {links.find(([url]) => url === pathname)?.[1] || "الملف الشخصي"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden text-xs text-slate-500 md:block">
              Asia / Baghdad
            </span>
            <button
              aria-label="تبديل المظهر"
              onClick={() => {
                document.documentElement.classList.toggle("dark", !dark);
                localStorage.setItem("theme", dark ? "light" : "dark");
                setDark(!dark);
              }}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Bell size={18} className="muted" />
            <span className="h-8 w-px bg-slate-200" />
            <span className="text-xs font-semibold">{admin.name}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-5 md:p-9">
          {children}
        </main>
        <ProjectCredits />
      </div>
    </div>
  );
}
