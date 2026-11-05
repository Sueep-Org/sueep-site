"use client";

import { ConfirmProvider, ToastProvider } from "../components/ui";
import { PricingSettingsProvider } from "@/app/components/PricingSettingsProvider";
import type { PricingSettings } from "@/lib/pricingSettings";
import { AppListsProvider } from "@/app/components/AppListsProvider";
import type { AppLists } from "@/lib/erp/appLists";

/**
 * Mounts the shared confirm-dialog, toast and Settings prices providers once for the whole
 * ERP shell, so `useConfirm()` / `useToast()` work from any client
 * component in any route underneath. Split out from layout.tsx because
 * that layout is a server component (reads auth) and context providers
 * need to be client components.
 */
export function ErpProviders({ pricing, lists, children }: { pricing: PricingSettings; lists: AppLists; children: React.ReactNode }) {
  return (
    <PricingSettingsProvider value={pricing}>
      <AppListsProvider value={lists}>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </AppListsProvider>
    </PricingSettingsProvider>
  );
}
