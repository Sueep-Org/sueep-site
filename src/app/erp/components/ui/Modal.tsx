"use client";

import { useEffect } from "react";

export type ModalSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "w-80",
  md: "w-full max-w-md",
  lg: "w-full max-w-lg",
};

/**
 * Shared modal shell (backdrop + centered card). 11 files in the ERP
 * hand-roll this same `fixed inset-0 bg-black/40` structure individually,
 * which is how we ended up shipping a modal (the labor over-budget warning)
 * whose backdrop silently discarded an unsaved entry on a stray click, with
 * no way to know it hadn't saved. Centralizing it here fixes that class of
 * bug once instead of per-modal, and adds Escape-to-close and a body-scroll
 * lock for free, which none of the hand-rolled versions had.
 *
 * Content (header, body, footer buttons) stays with the caller — this only
 * owns positioning and dismiss behavior, since what goes inside a modal
 * varies too much to standardize.
 */
export function Modal({
  open,
  onClose,
  dismissible = true,
  size = "sm",
  children,
}: {
  open: boolean;
  /**
   * Called when the user asks to close (backdrop click or Escape) — only
   * wired up when `dismissible` is true.
   */
  onClose: () => void;
  /**
   * Set to false when this modal gates a real action (a submit that hasn't
   * happened yet) rather than just confirming something already done or
   * offering a destructive action to cancel out of. When false, closing
   * requires an explicit button in `children` — e.g. a Cancel button that
   * also tells the user their input wasn't saved, the way the labor form's
   * over-budget and name-match modals do. Defaults to true because most
   * modals (delete confirmations, info popups) are safe to dismiss by
   * clicking away.
   */
  dismissible?: boolean;
  size?: ModalSize;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (dismissible && e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={dismissible ? onClose : undefined}
    >
      <div className={`rounded-xl bg-white p-5 shadow-2xl ${SIZE_CLASSES[size]}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
