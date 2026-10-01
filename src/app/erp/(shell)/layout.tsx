import { ErpNav } from "./ErpNav";
import { ScheduleNudgePopup } from "./ScheduleNudgePopup";
import { ErpProviders } from "./ErpProviders";
import { getErpAuth, isProjectManager } from "@/lib/erpAuth";

/** Neon cold start / Prisma can exceed default on first request after idle. */
export const maxDuration = 60;

export default async function ErpShellLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  const role = auth?.role ?? "EMPLOYEE";

  return (
    <ErpProviders>
      <div id="erp-shell" className="flex min-h-screen sm:h-screen flex-col sm:flex-row">
        <ErpNav role={role} />
        {isProjectManager(role) && <ScheduleNudgePopup />}
        {/* relative: makes main the containing block for absolute descendants
            (e.g. sr-only file inputs). Without it their containing block is
            html, so the browser's focus scroll after a file picker closes
            scrolls html past the shell into empty space, which html's
            overflow:hidden then leaves stuck until a reload. */}
        <main className="relative min-w-0 min-h-0 flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </ErpProviders>
  );
}
