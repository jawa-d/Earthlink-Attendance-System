"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  Users,
  UserCheck,
  Clock3,
  UserX,
  ShieldCheck,
  RefreshCw,
  ArrowUpLeft,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/client";
import { businessDate } from "@/lib/validation";
import { Button } from "./ui/button";
import { RecordsTable, type Row } from "./records-table";
type Dashboard = {
  monthly: { month: string; total: number }[];
  employees: number;
  registered: number;
  unregistered: number;
  counts: Record<string, number>;
  rows: Row[];
  trends: { date: string; total: number }[];
  departments: { name: string; total: number }[];
  shifts?: { id: string; label: string; events: number; registeredEmployees: number }[];
};
export function Dashboard({ preview = false }: { preview?: boolean }) {
  const [date, setDate] = useState(businessDate());
  const query = useQuery({
    queryKey: ["dashboard", date, preview],
    enabled: !preview,
    queryFn: () => api<Dashboard>(`/api/admin/dashboard?date=${date}`),
  });
  const d = query.data;
  const cards = [
    ["الموظفون النشطون", d?.employees, Users, "#2563eb"],
    ["سجلوا الحضور", d?.registered, UserCheck, "#16a34a"],
    ["حاضر", d?.counts.PRESENT, UserCheck, "#16a34a"],
    ["متأخر", d?.counts.LATE, Clock3, "#f59e0b"],
    ["غائب", d?.counts.ABSENT, UserX, "#ef4444"],
    ["بعذر", d?.counts.EXCUSED, ShieldCheck, "#6366f1"],
    ["لم يسجل الحضور", d?.unregistered, Clock3, "#94a3b8"],
  ] as const;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="muted mb-2 text-xs">نظرة عامة على حضور القسم</p>
          <h1 className="text-2xl font-bold">
            لوحة التحكم <span className="mr-2 text-lg">👋</span>
          </h1>
          <p className="muted mt-3 text-xs">
            تابع حضور فريقك، واطّلع على آخر التحديثات.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CalendarDays size={18} className="muted" />
          <input
            aria-label="تاريخ لوحة التحكم"
            className="max-w-40 text-xs"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button
            disabled={preview}
            variant="outline"
            onClick={() => query.refetch()}
          >
            <RefreshCw size={15} />
            تحديث
          </Button>
        </div>
      </div>
      {query.error && (
        <p role="alert" className="mb-4 text-red-600">
          {query.error.message}
        </p>
      )}
      <div className="mb-7 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {cards.map(([label, value, Icon, color]) => (
          <section className="panel p-5" key={label}>
            <div className="mb-5 flex items-center justify-between">
              <Icon size={20} style={{ color }} />
              <span className="muted text-[10px]">اليوم</span>
            </div>
            <p className="mb-2 text-3xl font-bold">{value ?? "—"}</p>
            <p className="muted text-[11px]">{label}</p>
          </section>
        ))}
      </div>
      <div className="mb-7 grid gap-6 xl:grid-cols-3">
        <section className="panel p-6 xl:col-span-2">
          <div className="mb-7 flex justify-between">
            <div>
              <h2 className="font-semibold">اتجاه الحضور</h2>
              <p className="muted mt-2 text-xs">
                عدد الموظفين الحاضرين يومياً خلال آخر 30 يوماً
              </p>
            </div>
            <span className="badge">آخر 30 يوم</span>
          </div>
          <div dir="ltr" className="h-60">
            {d?.trends.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trends}>
                  <defs>
                    <linearGradient id="blue" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#2563eb"
                        stopOpacity={0.22}
                      />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#e8eef5"
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="url(#blue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="muted flex h-full items-center justify-center">
                لا توجد بيانات للفترة المحددة
              </div>
            )}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-semibold">توزيع حالات الحضور</h2>
          <p className="muted mt-2 text-xs">حالات الموظفين النشطين</p>
          <div className="h-48" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cards
                    .slice(2)
                    .map((c) => ({ name: c[0], value: c[1] || 0 }))}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                >
                  {cards.slice(2).map((c) => (
                    <Cell key={c[0]} fill={c[3]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {cards.slice(2).map((c) => (
              <div key={c[0]} className="flex items-center gap-2 text-[10px]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: c[3] }}
                />
                {c[0]}
                <b className="mr-auto">{c[1] ?? "—"}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between p-6">
          <div>
            <h2 className="font-semibold">سجل الحضور اليومي</h2>
            <p className="muted mt-2 text-xs">
              آخر سجلات اليوم المحدد • بتوقيت بغداد
            </p>
          </div>
          <Link
            className="flex items-center gap-2 text-xs text-blue-600"
            href="/admin/attendance"
          >
            عرض الكل
            <ArrowUpLeft size={16} />
          </Link>
        </div>
        <RecordsTable rows={d?.rows || []} kind="attendance" />
      </section>
      <section className="panel mt-6 p-6">
        <h2 className="mb-5 font-semibold">إجمالي الحضور الشهري</h2>
        <div className="h-48" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.monthly}>
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#2563eb" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      {(d?.departments.length || 0) > 1 && (
        <section className="panel mt-6 p-6">
          <h2 className="mb-5 font-semibold">مقارنة الأقسام</h2>
          <div className="h-48" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d?.departments}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#2563eb" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      <section className="panel mt-6 overflow-x-auto p-6">
        <h2 className="mb-4 font-semibold">الحضور حسب الشفت</h2>
        <p className="muted mb-4 text-xs">كل موظف يُحتسب مرة داخل كل شفت؛ مجموع الشفتات قد يزيد عن إجمالي الموظفين إذا سجّل الموظف أكثر من حدث.</p>
        {d?.shifts?.length ? <table><thead><tr><th>الشفت</th><th>أحداث الحضور</th><th>موظفون سجّلوا الحضور</th></tr></thead><tbody>{d.shifts.map(s => <tr key={`${s.id}-${s.label}`}><td>{s.label}</td><td>{s.events}</td><td>{s.registeredEmployees}</td></tr>)}</tbody></table> : <p className="muted">لا توجد سجلات للشفتات في التاريخ المحدد.</p>}
      </section>
      <p className="muted mt-5 text-[10px]">
        عدم التسجيل لا يعني الغياب. جميع الحالات الإدارية تُعيّن يدوياً.
      </p>
    </>
  );
}
