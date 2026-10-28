import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { loadQboConnection, qboGet } from "./qboClient";
import { arFromReport, pnlFromReport, pnlTxnsFromDetail, type QboReport } from "./qboReports";
import { saveArImport, saveInvoicesAndPayments, saveOpenItems, savePnlImport, savePnlTxns, type OpenItem, type QboInvoiceRow, type QboPaymentRow } from "./qboImport";
import { FINANCE_DATA_START } from "./financeSummary";

/**
 * Reads the Profit and Loss (by month, cash basis, from Jan 1 last year to
 * today), today's A/R Aging and what's still open (invoices, unapplied
 * payments, credits) from QuickBooks into the ERP's tables
 * (QUICKBOOKS_PLAN.md Phase 1). Only a production connection saves: local dev
 * and the live site share one database, so sandbox data must never replace
 * Sueep's real numbers. A sandbox sync returns what it read without saving.
 */

const PAGE = 1000;
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

type QboTxn = {
  Id: string;
  DocNumber?: string;
  PaymentRefNum?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  UnappliedAmt?: number;
  RemainingCredit?: number;
  CustomerRef?: { name?: string };
  Line?: { Amount?: number; LinkedTxn?: { TxnId?: string; TxnType?: string }[] }[];
};

/** Every row of a QuickBooks query, a page at a time. */
async function queryAll(entity: string, where: string): Promise<QboTxn[]> {
  const out: QboTxn[] = [];
  for (let start = 1; ; start += PAGE) {
    const q = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const res = await qboGet<{ QueryResponse?: Record<string, QboTxn[] | undefined> }>(`/query?query=${encodeURIComponent(q)}`);
    const rows = res.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * Unpaid invoices, payments not applied to an invoice, and unused credit
 * memos. Unapplied amount can't be filtered in a query, so payments since
 * the start of last year are read and picked here.
 */
async function loadOpenItems(payments: QboTxn[]): Promise<OpenItem[]> {
  const [invoices, credits] = await Promise.all([queryAll("Invoice", "Balance > '0'"), queryAll("CreditMemo", "Balance > '0'")]);
  const item = (kind: OpenItem["kind"], t: QboTxn, open: unknown, doc: string | undefined): OpenItem => ({
    kind,
    qboId: t.Id,
    docNumber: doc?.trim() || null,
    customer: t.CustomerRef?.name?.trim() || "(no customer)",
    txnDate: t.TxnDate ?? null,
    dueDate: t.DueDate ?? null,
    totalCents: cents(t.TotalAmt),
    openCents: cents(open),
  });
  return [
    ...invoices.map((t) => item("INVOICE", t, t.Balance, t.DocNumber)),
    ...payments.filter((t) => Number(t.UnappliedAmt) > 0).map((t) => item("PAYMENT", t, t.UnappliedAmt, t.PaymentRefNum)),
    ...credits.map((t) => item("CREDIT_MEMO", t, t.RemainingCredit ?? t.Balance, t.DocNumber)),
  ].filter((i) => i.openCents !== 0);
}

export type QboSyncResult = {
  saved: boolean;
  environment: string;
  pnl: { months: number; accounts: number; totalsMatch: boolean; from: string | null; to: string | null };
  ar: { asOf: string; customers: number; totalCents: number; totalsMatch: boolean };
  open: { invoices: number; payments: number; credits: number };
  detail: { transactions: number; invoices: number; payments: number; totalsMatch: boolean };
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
  const payments = await queryAll("Payment", `TxnDate >= '${from}'`);
  const openItems = await loadOpenItems(payments);
  // For the QuickBooks check drill-downs: every invoice and payment since January last year, and the
  // detailed P&L (each transaction) since the ERP's data start.
  const invoices = await queryAll("Invoice", `TxnDate >= '${from}'`);
  const detailFrom = `${FINANCE_DATA_START}-01`;
  const detail = pnlTxnsFromDetail(
    await qboGet<QboReport>(`/reports/ProfitAndLossDetail?start_date=${detailFrom}&end_date=${today}&accounting_method=Cash`),
  );
  if ("error" in detail) throw new Error(detail.error);
  // The detail must add up to the summary P&L for every month and section it covers.
  const detailMatch = pnl.checks
    .filter((c) => c.month >= FINANCE_DATA_START)
    .every((c) => detail.filter((t) => t.month === c.month && t.section === c.label).reduce((s, t) => s + t.amountCents, 0) === c.linesCents);
  const invoiceRows: QboInvoiceRow[] = invoices.map((t) => ({
    qboId: t.Id,
    docNumber: t.DocNumber?.trim() || null,
    customer: t.CustomerRef?.name?.trim() || "(no customer)",
    txnDate: t.TxnDate ?? null,
    dueDate: t.DueDate ?? null,
    totalCents: cents(t.TotalAmt),
    balanceCents: cents(t.Balance),
  }));
  const paymentRows: QboPaymentRow[] = payments.map((t) => ({
    qboId: t.Id,
    txnDate: t.TxnDate ?? null,
    customer: t.CustomerRef?.name?.trim() || "(no customer)",
    refNum: t.PaymentRefNum?.trim() || null,
    totalCents: cents(t.TotalAmt),
    unappliedCents: cents(t.UnappliedAmt),
    links: (t.Line ?? []).flatMap((l) =>
      (l.LinkedTxn ?? []).filter((x) => x.TxnType === "Invoice" && x.TxnId).map((x) => ({ invoiceQboId: x.TxnId!, amountCents: cents(l.Amount) })),
    ),
  }));

  const totalsMatch = pnl.checks.every((c) => c.fileCents === c.linesCents);
  const arMatch = ar.fileTotalCents == null || ar.fileTotalCents === ar.rowsTotalCents;
  // Don't save a report whose pieces don't add up to its own totals.
  if (totalsMatch && arMatch && conn.environment === "production") {
    const meta = { source: "SYNC" as const, fileName: null, importedBy: opts.by };
    await savePnlImport(pnl, meta);
    await saveArImport(ar, meta);
    await saveOpenItems(openItems, meta);
    await saveInvoicesAndPayments(invoiceRows, paymentRows, meta);
    if (detailMatch) await savePnlTxns(detail, [...new Set(pnl.months.filter((m) => m >= FINANCE_DATA_START))], meta);
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
    detail: { transactions: detail.length, invoices: invoiceRows.length, payments: paymentRows.length, totalsMatch: detailMatch },
    open: {
      invoices: openItems.filter((i) => i.kind === "INVOICE").length,
      payments: openItems.filter((i) => i.kind === "PAYMENT").length,
      credits: openItems.filter((i) => i.kind === "CREDIT_MEMO").length,
    },
  };
}
