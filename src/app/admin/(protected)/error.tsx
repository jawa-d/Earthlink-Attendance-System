"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel p-10">
      <h1 className="mb-5 text-xl font-bold">تعذر تحميل البيانات</h1>
      <p className="muted mb-6">
        يرجى مراجعة إعدادات الاتصال بقاعدة البيانات أو المحاولة لاحقاً.
      </p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </section>
  );
}
