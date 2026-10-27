import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { QuickBooksUpload, type ImportRow } from "./QuickBooksUpload";

export const metadata: Metadata = { title: "QuickBooks" };
export const dynamic = "force-dynamic";

export default async function QuickBooksPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) redirect("/erp");

  const [imports, months, latestAr] = await Promise.all([
    prisma.qboImport.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.qboPnlLine.findMany({ distinct: ["month"], select: { month: true }, orderBy: { month: "asc" } }),
    prisma.qboArRow.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }),
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
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        QuickBooks
        <InfoTip text="QuickBooks reports brought into the ERP, for the Finance dashboard and the money owed check. Upload the exports here once a month until QuickBooks is connected directly. Nothing here changes QuickBooks." />
      </h1>
      <QuickBooksUpload
        imports={rows}
        pnlMonths={months.map((m) => m.month)}
        ar={latestAr ? { asOf: latestAr.asOf, totalCents: arTotal?._sum.totalCents ?? 0 } : null}
      />
    </div>
  );
}
