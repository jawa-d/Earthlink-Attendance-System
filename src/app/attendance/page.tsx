"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, ArrowLeft, ShieldCheck } from "lucide-react";
import { corporateEmail } from "@/lib/validation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function Attendance() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string }>();
  const [error, setError] = useState("");
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#183153] text-white">
            <QrCode size={28} />
          </div>
          <p className="text-xl font-bold tracking-wide" dir="ltr">
            earthlink<span className="text-blue-600">.</span>
          </p>
          <p className="muted mt-2 text-xs">نظام الحضور الداخلي للقسم</p>
        </div>
        <section className="panel p-8">
          <p className="mb-2 text-xs text-blue-600">أهلاً بك في يوم عمل جديد</p>
          <h1 className="text-2xl font-bold">تسجيل الحضور اليومي</h1>
          <p className="muted mb-8 mt-3 text-sm">
            أدخل بريدك الوظيفي لتسجيل حضورك اليوم.
          </p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError("");
              const parsed = corporateEmail.safeParse(values.email);
              if (!parsed.success) {
                setError(
                  "يرجى إدخال بريد إلكتروني صحيح ينتهي بـ @earthlink.iq",
                );
                return;
              }
              try {
                const result = await api("/api/attendance", {
                  method: "POST",
                  body: JSON.stringify({ email: parsed.data }),
                });
                sessionStorage.setItem(
                  "attendance-result",
                  JSON.stringify(result),
                );
                router.push("/attendance/success");
              } catch (e) {
                setError((e as Error).message);
              }
            })}
          >
            <label htmlFor="email">البريد الإلكتروني الوظيفي</label>
            <input
              id="email"
              type="email"
              dir="ltr"
              placeholder="name@earthlink.iq"
              autoComplete="email"
              required
              maxLength={254}
              {...register("email")}
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            <Button disabled={isSubmitting} className="mt-5 w-full">
              {isSubmitting ? "جاري التسجيل…" : "تسجيل الحضور"}
              <ArrowLeft size={17} />
            </Button>
          </form>
          <p className="muted mt-6 flex items-center justify-center gap-2 text-xs">
            <ShieldCheck size={15} /> متاح لموظفي القسم المسجلين فقط
          </p>
        </section>
        <p className="muted mt-5 text-center text-xs leading-6">
          التسجيل ذاتي. إدخال البريد لا يثبت الهوية أو الوجود داخل القسم.
        </p>
        <Link
          className="muted mt-6 block text-center text-xs"
          href="/admin/login"
        >
          دخول المسؤولين
        </Link>
      </div>
    </main>
  );
}
