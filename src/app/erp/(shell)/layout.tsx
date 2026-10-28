import { ErpNav } from "./ErpNav";
import { ErpProviders } from "./ErpProviders";
import Link from "next/link";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { prisma } from "@/lib/prisma";
import { qboEnvironment } from "@/lib/erp/qboClient";

/** Neon cold start / Prisma can exceed default on first request after idle. */
export const maxDuration = 60;

export default async function ErpShellLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  const role = auth?.role ?? "EMPLOYEE";
  // Admins and the Business Manager see a banner on every page when QuickBooks needs reconnecting.
  const qboBroken = canManageQuickBooks(role)
    ? await prisma.qboConnection.findFirst({ where: { status: "NEEDS_RECONNECT", environment: qboEnvironment() }, select: { id: true } }).catch(() => null)
    : null;

  return (
    <ErpProviders>
      <div id="erp-shell" className="flex min-h-screen sm:h-screen flex-col sm:flex-row">
        <ErpNav role={role} />
        {/* relative: makes main the containing block for absolute descendants
            (e.g. sr-only file inputs). Without it their containing block is
            html, so the browser's focus scroll after a file picker closes
            scrolls html past the shell into empty space, which html's
            overflow:hidden then leaves stuck until a reload. */}
        <main className="relative min-w-0 min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {qboBroken ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              QuickBooks needs to be connected again.{" "}
              <Link href="/erp/quickbooks" className="font-medium underline">Reconnect</Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </ErpProviders>
  );
}
