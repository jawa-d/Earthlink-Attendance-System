"use client";
import { Clock3 } from "lucide-react";
import { ATTENDANCE_COOLDOWN_MS } from "@/lib/cooldown-time";
export function AttendanceCountdown({
  remaining,
  nextAllowedAt,
}: {
  remaining: number;
  nextAllowedAt: string;
}) {
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  const parts = [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ];
  const progress = Math.min(
    100,
    Math.max(0, 100 * (1 - remaining / ATTENDANCE_COOLDOWN_MS)),
  );
  return (
    <section
      className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/40"
      aria-labelledby="cooldown-title"
    >
      <div className="mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <Clock3 size={20} aria-hidden="true" />
        <h2 id="cooldown-title" className="font-semibold">
          تم تسجيل حضورك مسبقاً
        </h2>
      </div>
      <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
        يمكنك تسجيل الحضور مرة أخرى بعد انتهاء الوقت المتبقي
      </p>
      <div
        role="timer"
        aria-label="الوقت المتبقي لتسجيل الحضور"
        aria-live="off"
        className="my-5 grid grid-cols-3 gap-2"
        dir="ltr"
      >
        {parts.map((value, index) => (
          <div
            key={index}
            className="rounded-xl border border-blue-100 bg-white px-2 py-3 text-center dark:border-blue-900 dark:bg-slate-900"
          >
            <p className="font-mono text-3xl font-semibold tabular-nums text-blue-700 sm:text-4xl dark:text-blue-300">
              {String(value).padStart(2, "0")}
            </p>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {["ساعات", "دقائق", "ثوانٍ"][index]}
            </p>
          </div>
        ))}
      </div>
      <div
        role="progressbar"
        aria-label="انقضاء فترة الانتظار"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900"
        dir="ltr"
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-4 text-xs leading-6 text-slate-600 dark:text-slate-300">
        موعد التسجيل التالي بتوقيت بغداد:
        <br />
        <time
          dateTime={nextAllowedAt}
          className="font-semibold text-blue-800 dark:text-blue-200"
        >
          {new Intl.DateTimeFormat("ar-IQ", {
            timeZone: "Asia/Baghdad",
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(new Date(nextAllowedAt))}
        </time>
      </p>
      {!seconds && (
        <p
          role="status"
          className="mt-3 text-xs text-blue-700 dark:text-blue-300"
        >
          جارٍ التحقق من إمكانية التسجيل…
        </p>
      )}
    </section>
  );
}
