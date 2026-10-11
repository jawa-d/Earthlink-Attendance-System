"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

type Selection = { ids: string[] } | { filters: Record<string, string> };
type Snapshot = { snapshotId: string; count: number; code: string; expiresAt: string };
const endpoint = "/api/admin/attendance-deletion";
export function AttendancePermanentDelete({ selection, onClose, onDeleted }: {
  selection: Selection;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [receipt, setReceipt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let active = true;
    api<Snapshot>(endpoint, { method: "POST", body: JSON.stringify({ action: "prepare", selection }) })
      .then(value => { if (active) setSnapshot(value); })
      .catch(err => { if (active) setError((err as Error).message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [selection]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 409) {
        setStale(true); setVerified(false); setConfirmed(false);
      }
      if (err instanceof ApiError && err.status === 401) {
        setReauthenticated(false); setVerified(false);
      }
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title="حذف سجلات الحضور نهائياً">
    <div className="space-y-5">
      <p className="text-sm text-red-700">الحذف النهائي لا يمكن التراجع عنه. صدّر النسخة الاحتياطية ثم أكد تنزيلها قبل المتابعة.</p>
      {busy && <p role="status">جارٍ تنفيذ الخطوة…</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {snapshot && <>
        <p role="status" className="rounded-xl bg-slate-50 p-4 font-bold dark:bg-slate-800">عدد السجلات المحددة بالضبط: {snapshot.count}</p>
        {"filters" in selection && <p className="muted text-sm">يشمل التحديد جميع السجلات المطابقة للفلاتر، عبر كل الصفحات.</p>}
        <Button variant="outline" disabled={busy || stale} onClick={() => perform(async () => {
          setReceipt(""); setConfirmed(false); setReauthenticated(false); setVerified(false);
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", snapshotId: snapshot.snapshotId }) });
          if (!response.ok) {
            const data = await response.json();
            throw new ApiError(data.error || "تعذر تصدير النسخة الاحتياطية", response.status, data);
          }
          const backupReceipt = response.headers.get("X-Backup-Receipt");
          const blob = await response.blob();
          if (!backupReceipt || !blob.size) throw new Error("لم يكتمل تصدير النسخة الاحتياطية");
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url; link.download = `attendance-backup-${snapshot.snapshotId}.xlsx`;
          document.body.appendChild(link); link.click(); link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 60000);
          setReceipt(backupReceipt);
        })}>تصدير إلى Excel</Button>
        {!!receipt && <>
          <label className="flex items-start gap-3 text-sm">
            <input className="mt-1 w-auto" type="checkbox" checked={confirmed} disabled={busy || stale} onChange={e => { setConfirmed(e.target.checked); setVerified(false); }} />
            أؤكد أنني قمت بتحميل نسخة Excel احتياطية من سجلات الحضور.
          </label>
          <p className="muted text-xs">تحقق من حفظ الملف على جهازك قبل التأكيد.</p>
          <label>كلمة مرور المسؤول الأعلى
            <input type="password" autoComplete="current-password" value={password} disabled={busy || stale} onChange={e => setPassword(e.target.value)} />
          </label>
          <Button variant="outline" disabled={busy || stale || !confirmed || !password} onClick={() => perform(async () => {
            setReauthenticated(false); setVerified(false);
            try {
              await api(endpoint, { method: "POST", body: JSON.stringify({ action: "reauthenticate", snapshotId: snapshot.snapshotId, password }) });
              setReauthenticated(true);
            } finally { setPassword(""); }
          })}>تأكيد الهوية</Button>
          {reauthenticated && <p role="status" className="text-sm text-green-700">تم تأكيد الهوية. صالح لمدة خمس دقائق.</p>}
          <p className="text-sm">رمز تأكيد الحذف لهذا التحديد: <strong dir="ltr">{snapshot.code}</strong></p>
          <label>رمز الحذف
            <input dir="ltr" value={code} maxLength={8} disabled={busy || stale} onChange={e => { setCode(e.target.value.toUpperCase()); setVerified(false); }} />
          </label>
          <Button variant="outline" disabled={busy || stale || !confirmed || !reauthenticated || code.length !== 8} onClick={() => perform(async () => {
            setVerified(false);
            await api(endpoint, { method: "POST", body: JSON.stringify({ action: "verify", snapshotId: snapshot.snapshotId, code }) });
            setVerified(true);
          })}>التحقق من رمز الحذف</Button>
          {verified && <p role="status" className="text-sm text-green-700">تم التحقق من رمز الحذف على الخادم.</p>}
        </>}
        <label>سبب الحذف النهائي
          <textarea minLength={5} maxLength={500} value={reason} disabled={busy || stale} onChange={e => setReason(e.target.value)} />
        </label>
        {stale && <p className="text-sm">أغلق النافذة وأعد تحديد السجلات وتصدير نسخة جديدة.</p>}
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" disabled={busy || stale || !receipt || !confirmed || !reauthenticated || !verified || reason.trim().length < 5} onClick={() => perform(async () => {
            await api(endpoint, { method: "DELETE", body: JSON.stringify({ snapshotId: snapshot.snapshotId, backupConfirmed: confirmed, receipt, code, reason }) });
            onClose();
            await onDeleted();
          })}>حذف {snapshot.count} سجل نهائياً</Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>إلغاء</Button>
        </div>
      </>}
    </div>
  </Dialog>;
}
