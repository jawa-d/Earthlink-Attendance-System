import { RecordsTable } from "./records-table";
const titles: Record<string, string> = {
  employees: "دليل الموظفين",
  attendance: "سجل الحضور",
  reports: "التقارير والإحصائيات",
  "audit-logs": "سجل العمليات",
  qr: "رمز الحضور الدائم",
  settings: "إعدادات النظام",
  profile: "الملف الشخصي",
};
export function PreviewSection({ section }: { section: string }) {
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold">{titles[section]}</h1>
      <section className="panel overflow-hidden">
        <div className="p-6">
          <h2 className="font-semibold">الواجهة متاحة للمعاينة</h2>
          <p className="muted mt-3 text-sm">
            يحتاج هذا القسم إلى قاعدة بيانات وحساب مسؤول لعرض البيانات وتنفيذ
            العمليات.
          </p>
        </div>
        {["employees", "attendance", "reports", "audit-logs"].includes(
          section,
        ) && (
          <RecordsTable
            rows={[]}
            kind={section === "reports" ? "attendance" : section}
          />
        )}
      </section>
    </>
  );
}
