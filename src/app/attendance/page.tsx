"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, ArrowLeft, ShieldCheck } from "lucide-react";
import { corporateEmail } from "@/lib/validation";
import { api, ApiError } from "@/lib/client";
import { useAttendanceCooldown } from "@/components/use-attendance-cooldown";
import { AttendanceCountdown } from "@/components/attendance-countdown";
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
  const cooldown = useAttendanceCooldown();
  return (
    <main className="flex flex-1 items-center justify-center p-5">
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
              if (cooldown.blocked) return;
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
                if (
                  e instanceof ApiError &&
                  e.data.code === "ATTENDANCE_COOLDOWN" &&
                  typeof e.data.nextAllowedAt === "string" &&
                  typeof e.data.serverNow === "string"
                )
                  cooldown.acceptCooldown({
                    nextAllowedAt: e.data.nextAllowedAt,
                    serverNow: e.data.serverNow,
                  });
                else setError((e as Error).message);
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
            <Button
              disabled={isSubmitting || cooldown.blocked}
              className="mt-5 w-full"
            >
              {isSubmitting ? "جاري التسجيل…" : "تسجيل الحضور"}
              <ArrowLeft size={17} />
            </Button>
          </form>
          {cooldown.status === "loading" && (
            <p
              role="status"
              className="mt-4 text-center text-xs text-slate-500"
            >
              جارٍ التحقق من حالة التسجيل…
            </p>
          )}
          {cooldown.status === "cooldown" && cooldown.times && (
            <AttendanceCountdown
              remaining={cooldown.remaining}
              nextAllowedAt={cooldown.times.nextAllowedAt}
            />
          )}
          {cooldown.status === "error" && (
            <div className="mt-4 space-y-3">
              <p role="alert" className="text-xs text-red-600">
                تعذر التحقق من فترة الانتظار. تحقق من الاتصال وأعد المحاولة.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void cooldown.refresh()}
              >
                إعادة التحقق
              </Button>
            </div>
          )}
          {cooldown.status === "unavailable" && (
            <p role="alert" className="mt-4 text-xs text-red-600">
              تعذر تسجيل الحضور. يرجى التواصل مع مسؤول القسم.
            </p>
          )}
          {cooldown.status !== "ready" && cooldown.status !== "loading" && (
            <button
              type="button"
              className="mt-4 text-xs text-blue-600"
              onClick={() => {
                setError("");
                void cooldown.clear();
              }}
            >
              استخدام بريد موظف آخر
            </button>
          )}
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
