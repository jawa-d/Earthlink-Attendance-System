"use client";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
type Result = { name: string; email: string; date: string; checkInAt: string; shiftLabel?: string };
export default function Success() {
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const value = sessionStorage.getItem("attendance-result");
    if (value) queueMicrotask(() => setResult(JSON.parse(value)));
  }, []);
  return (
    <main className="flex flex-1 items-center justify-center p-5">
      <section className="panel w-full max-w-md p-9 text-center">
        <CheckCircle2 className="mx-auto mb-5 text-green-600" size={56} />
        <h1 className="text-xl font-bold">
          {result ? "تم تسجيل حضورك بنجاح" : "تأكيد الحضور"}
        </h1>
        {result ? (
          <div className="my-6 space-y-3">
            <p>{result.name}</p>
            <p dir="ltr" className="muted">
              {result.email}
            </p>
            <p>{result.date}</p>
            {result.shiftLabel && <p>{result.shiftLabel}</p>}
            <p>
              {new Date(result.checkInAt).toLocaleTimeString("ar-IQ", {
                timeZone: "Asia/Baghdad",
              })}
            </p>
          </div>
        ) : (
          <p className="my-6 muted">لا يوجد تأكيد محفوظ في هذا المتصفح.</p>
        )}
        <Link href="/attendance" className="text-blue-600">
          العودة لصفحة التسجيل
        </Link>
      </section>
    </main>
  );
}
