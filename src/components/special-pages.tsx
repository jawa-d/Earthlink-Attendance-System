"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { QrCode, Printer, Download, UserRound } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function QrPage() {
  const query = useQuery({
    queryKey: ["qr"],
    queryFn: () => api<{ url: string; image: string }>("/api/admin/qr"),
  });
  return (
    <>
      <div className="no-print mb-8 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">رمز الحضور الدائم</h1>
          <p className="muted mt-3">رمز واحد، صالح كل يوم طالما الرابط نشط.</p>
        </div>
        <div className="flex gap-3">
          <a download href="/api/admin/qr?format=png">
            <Button variant="outline">
              <Download size={16} />
              PNG
            </Button>
          </a>
          <a download href="/api/admin/qr?format=pdf">
            <Button variant="outline">
              <Download size={16} />
              PDF A4
            </Button>
          </a>
          <Button onClick={() => window.print()}>
            <Printer size={16} />
            طباعة
          </Button>
        </div>
      </div>
      {query.error ? (
        <p role="alert" className="text-red-600">
          تعذر توليد الرمز. اضبط QR_BASE_URL على رابط HTTPS للإنتاج.
        </p>
      ) : (
        <section className="panel print-area mx-auto max-w-2xl p-10 text-center">
          <QrCode className="mx-auto mb-5 text-blue-600" size={32} />
          <p dir="ltr" className="mb-5 text-2xl font-bold">
            earthlink.
          </p>
          <h2 className="text-2xl font-bold">نظام تسجيل الحضور</h2>
          <p className="muted mt-4">
            يرجى مسح رمز QR وإدخال البريد الإلكتروني الوظيفي لتسجيل الحضور
            اليومي.
          </p>
          {query.data && (
            <>
              <Image
                unoptimized
                width={1200}
                height={1200}
                alt="رمز QR لصفحة تسجيل الحضور"
                src={query.data.image}
                className="mx-auto my-8 w-full max-w-sm"
              />
              <p dir="ltr" className="muted break-all text-xs">
                {query.data.url}
              </p>
            </>
          )}
          <p className="mt-8 text-sm">
            1. امسح الرمز بكاميرا هاتفك <span className="mx-3">•</span> 2. أدخل
            بريدك الوظيفي <span className="mx-3">•</span> 3. سجّل حضورك
          </p>
        </section>
      )}
    </>
  );
}
export function Profile({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold">الملف الشخصي</h1>
      <section className="panel max-w-xl p-8">
        <UserRound size={40} className="mb-6 text-blue-600" />
        <h2 className="text-xl font-semibold">{name}</h2>
        <p className="muted my-4" dir="ltr">
          {email}
        </p>
        <span className="badge">{role}</span>
        <p className="muted mt-8 text-sm leading-7">
          تغيير كلمة المرور يتم بواسطة مشغّل النظام من خلال إجراء إعادة التعيين
          المحمي. يؤدي التغيير إلى إلغاء جميع الجلسات السابقة.
        </p>
      </section>
    </>
  );
}
type Admin = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};
export function SettingsPage() {
  const client = useQueryClient();
  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: () => api<Admin[]>("/api/admin/admins"),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ key: string; value: string }[]>("/api/admin/settings"),
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      api<
        {
          id: string;
          name: string;
          englishName: string | null;
          code: string | null;
          isActive: boolean;
        }[]
      >("/api/admin/departments"),
  });
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(url: string, method: string, data: unknown) {
    setBusy(true);
    try {
      await api(url, { method, body: JSON.stringify(data) });
      toast.success("تم الحفظ");
      await client.invalidateQueries();
      setModal(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold">إعدادات النظام</h1>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-7">
          <h2 className="mb-6 text-lg font-bold">إعدادات القسم</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              save("/api/admin/settings", "POST", Object.fromEntries(form));
            }}
          >
            <label>
              الإعداد
              <select name="key">
                <option value="departmentTitle">عنوان القسم</option>
                <option value="supportEmail">بريد الدعم</option>
              </select>
            </label>
            <label>
              القيمة
              <input name="value" required maxLength={200} />
            </label>
            <label>
              سبب التغيير
              <input name="reason" required minLength={5} />
            </label>
            <Button disabled={busy}>حفظ</Button>
          </form>
          <div className="muted mt-6 text-xs">
            {settings.data?.map((s) => (
              <p className="mt-2" key={s.key}>
                {s.key}: {s.value}
              </p>
            ))}
          </div>
          <p className="muted mt-6 text-xs leading-6">
            رابط رمز QR الدائم يُضبط بواسطة متغير QR_BASE_URL في بيئة النشر.
          </p>
        </section>
        <section className="panel p-7">
          <h2 className="mb-6 text-lg font-bold">إدارة الأقسام</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(
                "/api/admin/departments",
                "POST",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
            }}
          >
            <label>
              اسم القسم
              <input name="name" required minLength={2} />
            </label>
            <label>
              الاسم بالإنجليزية
              <input name="englishName" maxLength={120} dir="ltr" />
            </label>
            <label>
              رمز القسم
              <input
                name="code"
                required
                maxLength={64}
                pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                dir="ltr"
              />
            </label>
            <label>
              سبب الإضافة
              <input name="reason" required minLength={5} />
            </label>
            <Button disabled={busy}>إضافة قسم</Button>
          </form>
          <div className="mt-6 space-y-3">
            {departments.data?.map((d) => (
              <div key={d.id} className="flex justify-between">
                <span>
                  {d.name}
                  <small className="muted block">
                    {d.englishName} {d.code ? `(${d.code})` : ""}
                  </small>
                  <small className="muted block text-[10px]">{d.id}</small>
                </span>
                <details>
                  <summary className="cursor-pointer text-xs text-blue-600">
                    تعديل القسم
                  </summary>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(`/api/admin/departments/${d.id}`, "PATCH", {
                        ...Object.fromEntries(new FormData(e.currentTarget)),
                        isActive: d.isActive,
                      });
                    }}
                  >
                    <label>
                      الاسم بالعربية
                      <input
                        name="name"
                        defaultValue={d.name}
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      الاسم بالإنجليزية
                      <input
                        name="englishName"
                        defaultValue={d.englishName || ""}
                        maxLength={120}
                        dir="ltr"
                      />
                    </label>
                    <label>
                      رمز القسم
                      <input
                        name="code"
                        defaultValue={d.code || ""}
                          required
                          maxLength={64}
                        pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                        dir="ltr"
                      />
                    </label>
                    <label>
                      سبب التغيير
                      <input name="reason" required minLength={5} />
                    </label>
                    <Button disabled={busy}>حفظ</Button>
                  </form>
                </details>
                <button
                  className="text-xs text-blue-600"
                  onClick={() => {
                    const reason = window.prompt("سبب تغيير حالة القسم");
                    if (reason)
                      save(`/api/admin/departments/${d.id}`, "PATCH", {
                        name: d.name,
                        isActive: !d.isActive,
                        reason,
                      });
                  }}
                >
                  {d.isActive ? "إيقاف" : "تفعيل"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel mt-6 p-7">
        <div className="mb-6 flex justify-between">
          <h2 className="text-lg font-bold">حسابات المسؤولين</h2>
          <Button onClick={() => setModal(true)}>إضافة مسؤول</Button>
        </div>
        {admins.error && <p className="text-red-600">{admins.error.message}</p>}
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>البريد</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {admins.data?.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td dir="ltr">{a.email}</td>
                  <td>
                    <select
                      aria-label={`دور ${a.name}`}
                      value={a.role}
                      onChange={(e) => {
                        const reason = window.prompt("سبب تغيير الصلاحيات");
                        if (reason)
                          save(`/api/admin/admins/${a.id}`, "PATCH", {
                            role: e.target.value,
                            isActive: a.isActive,
                            reason,
                          });
                      }}
                    >
                      {["SUPER_ADMIN", "ADMIN", "VIEWER"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>{a.isActive ? "فعال" : "غير فعال"}</td>
                  <td>
                    <button
                      className="text-blue-600"
                      onClick={() => {
                        const reason = window.prompt("سبب تغيير حالة الحساب");
                        if (reason)
                          save(`/api/admin/admins/${a.id}`, "PATCH", {
                            role: a.role,
                            isActive: !a.isActive,
                            reason,
                          });
                      }}
                    >
                      {a.isActive ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Dialog open={modal} onOpenChange={setModal} title="إضافة مسؤول">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              "/api/admin/admins",
              "POST",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
          }}
        >
          <label>
            الاسم
            <input name="name" required minLength={2} />
          </label>
          <label>
            البريد الإلكتروني
            <input name="email" type="email" required dir="ltr" />
          </label>
          <label>
            كلمة مرور قوية (14 حرفاً على الأقل)
            <input
              name="password"
              type="password"
              required
              minLength={14}
              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          <label>
            الصلاحية
            <select name="role">
              <option>ADMIN</option>
              <option>VIEWER</option>
              <option>SUPER_ADMIN</option>
            </select>
          </label>
          <label>
            سبب الإضافة
            <input name="reason" required minLength={5} />
          </label>
          <Button disabled={busy}>إنشاء الحساب</Button>
        </form>
      </Dialog>
    </>
  );
}
