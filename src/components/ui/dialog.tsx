"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          dir="rtl"
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(95vw,620px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-white p-7 shadow-xl dark:bg-slate-900"
        >
          <DialogPrimitive.Title className="mb-6 text-xl font-bold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            أدخل البيانات المطلوبة ثم احفظ التغييرات
          </DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close
            className="absolute left-5 top-5"
            aria-label="إغلاق"
          >
            ×
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
