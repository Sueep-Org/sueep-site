"use client";

import { ConfirmProvider, ToastProvider } from "../components/ui";

/**
 * Mounts the shared confirm-dialog and toast providers once for the whole
 * ERP shell, so `useConfirm()` / `useToast()` work from any client
 * component in any route underneath. Split out from layout.tsx because
 * that layout is a server component (reads auth) and context providers
 * need to be client components.
 */
export function ErpProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
