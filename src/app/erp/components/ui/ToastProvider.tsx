"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastVariant = "success" | "error";
type ToastItem = { id: number; message: string; variant: ToastVariant };

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

const DURATION_MS = 5000;

type Notify = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<Notify | null>(null);

/**
 * Shared toast/notification stack, stacked bottom-right. Before this, the
 * ERP had no shared feedback primitive at all (zero uses of "toast" across
 * src/app/erp) — every form either rolled its own inline banner or gave no
 * visible confirmation that a save/delete actually happened. This doesn't
 * replace those inline banners; it's for transient action results (mainly
 * paired with `useConfirm()` on destructive actions) where there's no
 * inline spot left to show one, e.g. right before navigating away.
 *
 * Mounted once in the ERP shell layout (`ErpProviders`). Call `useToast()`
 * from any client component underneath it: `toast("Building deleted.")`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const notify = useCallback<Notify>((message, variant = "success") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  function dismiss(id: number) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg ${VARIANT_CLASSES[t.variant]}`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
