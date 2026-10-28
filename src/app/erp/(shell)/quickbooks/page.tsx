import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageQuickBooks, canConnectQuickBooks } from "@/lib/erpAuth";
import { isQboConfigured, loadQboConnection } from "@/lib/erp/qboClient";
import { InfoTip } from "@/app/erp/components/ui";
import { QuickBooksUpload, type ImportRow } from "./QuickBooksUpload";
import { QuickBooksConnection } from "./QuickBooksConnection";
import { QuickBooksStatus } from "./QuickBooksStatus";
import { loadQboStatus } from "@/lib/erp/qboStatus";
import { FINANCE_DATA_START } from "@/lib/erp/financeSummary";

export const metadata: Metadata = { title: "QuickBooks" };
export const dynamic = "force-dynamic";

export default async function QuickBooksPage({ searchParams }: { searchParams: Promise<{ qbo?: string; detail?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) redirect("/erp");
  const { qbo, detail } = await searchParams;

  const [imports, months, latestAr, connection, status] = await Promise.all([
    prisma.qboImport.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.qboPnlLine.findMany({ distinct: ["month"], select: { month: true }, orderBy: { month: "asc" } }),
    prisma.qboArRow.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }),
    loadQboConnection(),
    loadQboStatus(),
  ]);
  // Each row holds only its own balance (a parent customer's row doesn't include its sub-customers), so the sum is the report total.
  const arTotal = latestAr ? await prisma.qboArRow.aggregate({ where: { asOf: latestAr.asOf }, _sum: { totalCents: true } }) : null;

  const rows: ImportRow[] = imports.map((i) => ({
    id: i.id,
    kind: i.kind as ImportRow["kind"],
    source: i.source,
    fileName: i.fileName,
    importedBy: i.importedBy,
    createdAt: i.createdAt.toISOString(),
    periodFrom: i.periodFrom,
    periodTo: i.periodTo,
    basis: i.basis,
    asOf: i.asOf,
    rowCount: i.rowCount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        QuickBooks
        <InfoTip text="QuickBooks reports brought into the ERP, for the Finance dashboard and the money owed check. Connect QuickBooks, or upload the exports here once a month until it is. Nothing here changes QuickBooks." />
      </h1>
        <Link href="/erp/quickbooks/check" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          See details →
        </Link>
      </div>
      <QuickBooksConnection
        configured={isQboConfigured()}
        canConnect={canConnectQuickBooks(auth.role)}
        result={qbo ?? null}
        detail={detail ?? null}
        connection={
          connection
            ? {
                status: connection.status === "NEEDS_RECONNECT" ? "NEEDS_RECONNECT" : "CONNECTED",
                environment: connection.environment,
                companyName: connection.companyName,
                connectedBy: connection.connectedBy,
                connectedAt: connection.connectedAt.toISOString(),
                lastError: connection.lastError,
                lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
              }
            : null
        }
      />
      <QuickBooksStatus status={status} firstMonth={FINANCE_DATA_START} />
      {/* Uploading is only for when QuickBooks isn't connected; the nightly sync does it otherwise. */}
      {!connection && (
      <QuickBooksUpload
        imports={rows}
        pnlMonths={months.map((m) => m.month)}
        ar={latestAr ? { asOf: latestAr.asOf, totalCents: arTotal?._sum.totalCents ?? 0 } : null}
      />
      )}
    </div>
  );
}
