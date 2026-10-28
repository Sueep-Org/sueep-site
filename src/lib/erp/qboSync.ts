import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { loadQboConnection, qboGet } from "./qboClient";
import { arFromReport, pnlFromReport, type QboReport } from "./qboReports";
import { saveArImport, savePnlImport } from "./qboImport";

/**
 * Reads the Profit and Loss (by month, cash basis, from Jan 1 last year to
 * today) and today's A/R Aging from QuickBooks into the ERP's tables
 * (QUICKBOOKS_PLAN.md Phase 1). Only a production connection saves: local dev
 * and the live site share one database, so sandbox data must never replace
 * Sueep's real numbers. A sandbox sync returns what it read without saving.
 */

export type QboSyncResult = {
  saved: boolean;
  environment: string;
  pnl: { months: number; accounts: number; totalsMatch: boolean; from: string | null; to: string | null };
  ar: { asOf: string; customers: number; totalCents: number; totalsMatch: boolean };
};

export async function qboSync(opts: { by: string | null }): Promise<QboSyncResult> {
  const conn = await loadQboConnection();
  if (!conn) throw new Error("QuickBooks isn't connected.");
  const today = todayEasternKey();
  const from = `${Number(today.slice(0, 4)) - 1}-01-01`;

  const pnlReport = await qboGet<QboReport>(
    `/reports/ProfitAndLoss?start_date=${from}&end_date=${today}&summarize_column_by=Month&accounting_method=Cash`,
  );
  const pnl = pnlFromReport(pnlReport);
  if ("error" in pnl) throw new Error(pnl.error);
  const arReport = await qboGet<QboReport>(`/reports/AgedReceivables?report_date=${today}`);
  const ar = arFromReport(arReport, today);
  if ("error" in ar) throw new Error(ar.error);

  const totalsMatch = pnl.checks.every((c) => c.fileCents === c.linesCents);
  const arMatch = ar.fileTotalCents == null || ar.fileTotalCents === ar.rowsTotalCents;
  // Don't save a report whose pieces don't add up to its own totals.
  if (totalsMatch && arMatch && conn.environment === "production") {
    const meta = { source: "SYNC" as const, fileName: null, importedBy: opts.by };
    await savePnlImport(pnl, meta);
    await saveArImport(ar, meta);
    await prisma.qboConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } });
  }

  return {
    saved: totalsMatch && arMatch && conn.environment === "production",
    environment: conn.environment,
    pnl: {
      months: pnl.months.length,
      accounts: new Set(pnl.lines.map((l) => `${l.section}|${l.parent}|${l.account}`)).size,
      totalsMatch,
      from: pnl.periodFrom,
      to: pnl.periodTo,
    },
    ar: { asOf: ar.asOf, customers: ar.rows.length, totalCents: ar.rowsTotalCents, totalsMatch: arMatch },
  };
}
