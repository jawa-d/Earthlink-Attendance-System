"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string; password: string }>();
  return (
    <main className="flex flex-1 items-center justify-center p-5">
      <section className="panel w-full max-w-md p-9">
        <LockKeyhole className="mb-6 text-blue-600" size={32} />
        <p className="muted mb-2" dir="ltr">
          EARTHLINK ATTENDANCE
        </p>
        <h1 className="mb-7 text-2xl font-bold">دخول المسؤولين</h1>
        <form
          className="space-y-5"
          onSubmit={handleSubmit(async (data) => {
            setError("");
            try {
              await api("/api/auth/login", {
                method: "POST",
                body: JSON.stringify(data),
              });
              router.push("/admin");
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <div>
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              {...register("email")}
            />
          </div>
          <div>
            <label htmlFor="password">كلمة المرور</label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              {...register("password")}
            />
          </div>
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          <Button disabled={isSubmitting} className="w-full">
            {isSubmitting ? "جاري الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
        <p className="muted mt-6 text-xs leading-6">
          لاستعادة كلمة المرور، تواصل مع مسؤول النظام عبر الإجراء الإداري
          المعتمد.
        </p>
      </section>
    </main>
  );
}
