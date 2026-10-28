import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { loadOpenInvoices } from "./dashboardMoney";
import { FINANCE_DATA_START, computeFinanceSummary, type FinanceMonth } from "./financeSummary";
import { HEALTH_SHARE_SETTING_KEY, parseHealthSharePct } from "./healthCost";

/**
 * The QuickBooks check page (QUICKBOOKS_PLAN.md Phase 3): the ERP next to
 * QuickBooks, money owed invoice by invoice and the big monthly totals, with
 * a status and the usual reasons for each difference. Read-only.
 */

// ── Money owed ─────────────────────────────────────────────────────────────

export type OwedStatus = "MATCH" | "BALANCE_DIFF" | "PAID_IN_ERP" | "QBO_ONLY" | "ERP_ONLY";

export const OWED_STATUS_LABELS: Record<OwedStatus, { label: string; hint: string; problem: boolean }> = {
  MATCH: { label: "Matches", hint: "Open in both, same balance", problem: false },
  BALANCE_DIFF: { label: "Different balance", hint: "Open in both, but the amounts owed differ (a partial payment recorded in one only, or an edited invoice)", problem: true },
  PAID_IN_ERP: { label: "Paid in the ERP only", hint: "Marked paid or voided in HubSpot/ERP, still open in QuickBooks. Usually a payment not applied to the invoice in QuickBooks", problem: true },
  QBO_ONLY: { label: "Only in QuickBooks", hint: "Open in QuickBooks, not linked to anything in the ERP. An invoice made in QuickBooks directly, or one HubSpot never synced", problem: true },
  ERP_ONLY: { label: "Only in the ERP", hint: "Open in HubSpot/ERP, but paid or missing in QuickBooks. Usually a payment HubSpot hasn't picked up", problem: true },
};

export type OwedRow = {
  key: string;
  number: string | null;
  erpTitle: string | null;
  erpHref: string | null;
  qboCustomer: string | null;
  erpCents: number | null;
  qboCents: number | null;
  status: OwedStatus;
  /** The QuickBooks customer shares no words with the ERP job or building (Avery Philly vs "Christina Hunt") */
  nameDiffers: boolean;
  /** Why it doesn't match, in plain words, from what both sides show. Null for a clean match. */
  cause: string | null;
  /** Each side's history of this invoice, for the expanded row. */
  history: { erp: string[]; qbo: string[] };
};

export type UnappliedRow = { key: string; kind: "PAYMENT" | "CREDIT_MEMO"; customer: string; dateKey: string | null; ref: string | null; cents: number };

export type MoneyOwedCheck = {
  syncedAt: string | null;
  rows: OwedRow[];
  unapplied: UnappliedRow[];
  erpOpenCents: number;
  qboOpenCents: number;
  unappliedCents: number;
  aging: { asOf: string; totalCents: number } | null;
};

/** Words that don't tell two names apart. */
const STOP = new Set(["the", "and", "inc", "llc", "co", "company", "group", "management", "apartments", "apartment", "apts", "unit", "units", "builders", "construction", "properties", "property", "monthly", "residences"]);

function words(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function sharesWord(a: string, b: string): boolean {
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}

const normNumber = (n: string | null | undefined) => (n ?? "").trim().toUpperCase() || null;

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function day(key: string | null | undefined): string {
  if (!key) return "no date";
  return new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type ErpInvoiceInfo = { number: string; status: string | null; invoiceDate: Date | null; dueDate: Date | null; paidDate: Date | null; totalCents: number | null; balanceCents: number | null };

/** The ERP's (HubSpot's) own record of each invoice number, any status. */
async function erpInvoiceInfo(numbers: string[]): Promise<Map<string, ErpInvoiceInfo>> {
  if (!numbers.length) return new Map();
  const select = { invoiceNumber: true, status: true, invoiceDate: true, dueDate: true, paidDate: true, invoiceTotalCents: true, balanceDueCents: true } as const;
  const where = { invoiceNumber: { in: numbers } };
  const [a, b, c] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({ where, select }),
    prisma.hubSpotSovInvoice.findMany({ where, select }),
    prisma.hubSpotContractInvoice.findMany({ where, select }),
  ]);
  const out = new Map<string, ErpInvoiceInfo>();
  for (const r of [...a, ...b, ...c]) {
    const n = normNumber(r.invoiceNumber);
    if (!n || out.has(n)) continue;
    out.set(n, { number: n, status: r.status, invoiceDate: r.invoiceDate, dueDate: r.dueDate, paidDate: r.paidDate, totalCents: r.invoiceTotalCents, balanceCents: r.balanceDueCents });
  }
  return out;
}

export async function loadMoneyOwedCheck(): Promise<MoneyOwedCheck> {
  const todayKey = todayEasternKey();
  const [erpOpen, qboItems, lastImport, latestAging, qboAllInvoices, qboPayments] = await Promise.all([
    loadOpenInvoices(todayKey),
    prisma.qboOpenItem.findMany(),
    prisma.qboImport.findFirst({ where: { kind: "OPEN_ITEMS" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.qboArRow.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }),
    prisma.qboInvoice.findMany(),
    prisma.qboPayment.findMany(),
  ]);
  const agingTotal = latestAging
    ? await prisma.qboArRow.aggregate({ where: { asOf: latestAging.asOf }, _sum: { totalCents: true } })
    : null;

  const qboInvoices = qboItems.filter((i) => i.kind === "INVOICE");
  // ERP invoices with the same numbers in any status, to tell "paid in the ERP" from "not in the ERP".
  const qboNumbers = [...new Set(qboInvoices.map((i) => normNumber(i.docNumber)).filter((n): n is string => !!n))];
  const pick = { invoiceNumber: true, status: true } as const;
  const [units, lines, months] = qboNumbers.length
    ? await Promise.all([
        prisma.hubSpotUnitInvoice.findMany({ where: { invoiceNumber: { in: qboNumbers } }, select: pick }),
        prisma.hubSpotSovInvoice.findMany({ where: { invoiceNumber: { in: qboNumbers } }, select: pick }),
        prisma.hubSpotContractInvoice.findMany({ where: { invoiceNumber: { in: qboNumbers } }, select: pick }),
      ])
    : [[], [], []];
  const erpKnown = new Set([...units, ...lines, ...months].map((r) => normNumber(r.invoiceNumber)).filter(Boolean));

  // QuickBooks' full record of each invoice (paid ones too) and the payments applied to it.
  const qboInvByNumber = new Map(qboAllInvoices.filter((i) => i.docNumber).map((i) => [normNumber(i.docNumber)!, i]));
  const paymentsByInvoice = new Map<string, { date: string | null; cents: number; customer: string }[]>();
  for (const p of qboPayments) {
    for (const l of (p.links as { invoiceQboId: string; amountCents: number }[]) ?? []) {
      paymentsByInvoice.set(l.invoiceQboId, [...(paymentsByInvoice.get(l.invoiceQboId) ?? []), { date: p.txnDate, cents: l.amountCents, customer: p.customer }]);
    }
  }
  const unappliedPool = [
    ...qboPayments.filter((p) => p.unappliedCents > 0).map((p) => ({ kind: "payment", customer: p.customer, date: p.txnDate, cents: p.unappliedCents })),
    ...qboItems.filter((i) => i.kind === "CREDIT_MEMO").map((i) => ({ kind: "credit", customer: i.customer, date: i.txnDate, cents: i.openCents })),
  ];
  /** An unapplied payment or credit for exactly this amount, the same customer's first. */
  const unappliedFor = (cents: number, customer: string | null) => {
    const same = unappliedPool.filter((u) => Math.abs(u.cents - cents) <= 1);
    return same.find((u) => customer && u.customer === customer) ?? same[0] ?? null;
  };

  // Before the first sync that reads QuickBooks' invoice list, causes can't be worked out.
  const detailSynced = qboAllInvoices.length > 0;
  const allNumbers = [...new Set([...erpOpen.map((e) => normNumber(e.number)), ...qboInvoices.map((q) => normNumber(q.docNumber))].filter((n): n is string => !!n))];
  const erpInfo = await erpInvoiceInfo(allNumbers);

  const historyFor = (num: string | null): OwedRow["history"] => {
    const erp: string[] = [];
    const qbo: string[] = [];
    const e = num ? erpInfo.get(num) : undefined;
    if (e) {
      erp.push(`HubSpot invoice dated ${day(e.invoiceDate?.toISOString())}, due ${day(e.dueDate?.toISOString())}, status ${e.status ?? "unknown"}`);
      if (e.totalCents != null) erp.push(`Total ${fmt(e.totalCents)}, balance ${fmt(e.balanceCents ?? e.totalCents)}`);
      if (e.paidDate) erp.push(`Marked paid ${day(e.paidDate.toISOString())}`);
    } else erp.push("No HubSpot invoice with this number in the ERP");
    const q = num ? qboInvByNumber.get(num) : undefined;
    if (q) {
      qbo.push(`Invoice dated ${day(q.txnDate)}, due ${day(q.dueDate)}, customer ${q.customer}`);
      qbo.push(`Total ${fmt(q.totalCents)}, balance ${fmt(q.balanceCents)}`);
      for (const p of paymentsByInvoice.get(q.qboId) ?? []) qbo.push(`Payment of ${fmt(p.cents)} applied on ${day(p.date)}`);
    } else qbo.push("No QuickBooks invoice with this number since January last year");
    return { erp, qbo };
  };

  const erpByNumber = new Map(erpOpen.filter((i) => i.number).map((i) => [normNumber(i.number)!, i]));
  const rows: OwedRow[] = [];
  const matchedErp = new Set<string>();
  for (const q of qboInvoices) {
    const num = normNumber(q.docNumber);
    const erp = num ? erpByNumber.get(num) : undefined;
    const info = num ? erpInfo.get(num) : undefined;
    const full = num ? qboInvByNumber.get(num) : undefined;
    const paid = full ? paymentsByInvoice.get(full.qboId) ?? [] : [];
    const history = historyFor(num);
    if (erp) {
      matchedErp.add(erp.id);
      const status: OwedStatus = Math.abs(erp.balanceCents - q.openCents) <= 1 ? "MATCH" : "BALANCE_DIFF";
      const nameDiffers = !sharesWord(erp.title, q.customer);
      let cause: string | null = null;
      if (status === "BALANCE_DIFF") {
        const qboPaid = paid.reduce((s, p) => s + p.cents, 0);
        cause =
          q.openCents < erp.balanceCents
            ? qboPaid > 0
              ? `QuickBooks recorded ${fmt(qboPaid)} of payments (${paid.map((p) => day(p.date)).join(", ")}) that HubSpot doesn't show. Check the payment reached HubSpot.`
              : `QuickBooks owes ${fmt(erp.balanceCents - q.openCents)} less than HubSpot, with no payment on it. The invoice amount was probably changed in QuickBooks.`
            : `HubSpot owes ${fmt(q.openCents - erp.balanceCents)} less than QuickBooks. A payment or credit recorded in HubSpot is missing in QuickBooks, or the invoice was changed in HubSpot.`;
      }
      if (nameDiffers) {
        const move = `Under "${q.customer}" in QuickBooks, but the ERP has it on ${erp.title}. Move it to the right customer in QuickBooks.`;
        cause = cause ? `${cause} ${move}` : move;
      }
      rows.push({ key: `q-${q.qboId}`, number: q.docNumber, erpTitle: erp.title, erpHref: erp.href, qboCustomer: q.customer, erpCents: erp.balanceCents, qboCents: q.openCents, status, nameDiffers, cause, history });
    } else {
      const status: OwedStatus = num && erpKnown.has(num) ? "PAID_IN_ERP" : "QBO_ONLY";
      const u = unappliedFor(q.openCents, q.customer);
      const uText = u ? `QuickBooks has an unapplied ${u.kind} of ${fmt(u.cents)} from ${u.customer} on ${day(u.date)}. Applying it to this invoice should clear it.` : null;
      let cause: string;
      if (!detailSynced) {
        cause = "Sync QuickBooks again to see why (the invoice list hasn't been read yet).";
      } else if (status === "PAID_IN_ERP") {
        cause =
          info?.status === "voided"
            ? "Voided in HubSpot, still open in QuickBooks. Void it in QuickBooks too."
            : uText ?? `Marked paid in HubSpot${info?.paidDate ? ` on ${day(info.paidDate.toISOString())}` : ""}, but QuickBooks has no payment on it. Record or apply the payment in QuickBooks.`;
      } else {
        cause = `${full?.txnDate ? `Made in QuickBooks on ${day(full.txnDate)}` : "In QuickBooks"} for ${q.customer}, and no HubSpot invoice in the ERP has this number. It was probably created in QuickBooks directly.${uText ? ` ${uText}` : ""}`;
      }
      rows.push({ key: `q-${q.qboId}`, number: q.docNumber, erpTitle: null, erpHref: null, qboCustomer: q.customer, erpCents: null, qboCents: q.openCents, status, nameDiffers: false, cause, history });
    }
  }
  for (const e of erpOpen) {
    if (matchedErp.has(e.id)) continue;
    const num = normNumber(e.number);
    const full = num ? qboInvByNumber.get(num) : undefined;
    const paid = full ? paymentsByInvoice.get(full.qboId) ?? [] : [];
    let cause: string;
    if (!num) cause = "The HubSpot invoice has no number, so it can't be found in QuickBooks.";
    else if (!full) cause = "Not in QuickBooks at all. HubSpot may not have sent it (check the HubSpot to QuickBooks sync), or it's there under another number.";
    else if (full.totalCents === 0) cause = `Voided or zeroed in QuickBooks (${day(full.txnDate)}). Void it in HubSpot too, or fix QuickBooks.`;
    else if (full.balanceCents === 0) {
      const last = paid.at(-1);
      cause = `Paid in QuickBooks${last ? ` on ${day(last.date)} (${fmt(paid.reduce((s, p) => s + p.cents, 0))})` : ""}, but HubSpot still shows it open. The payment didn't reach HubSpot; mark it paid there.`;
    } else cause = `Open in QuickBooks too, but under a different customer or number match failed (QuickBooks balance ${fmt(full.balanceCents)}).`;
    if (!detailSynced) cause = "Sync QuickBooks again to see why (the invoice list hasn't been read yet).";
    rows.push({ key: `e-${e.id}`, number: e.number, erpTitle: e.title, erpHref: e.href, qboCustomer: full?.customer ?? null, erpCents: e.balanceCents, qboCents: null, status: "ERP_ONLY", nameDiffers: false, cause, history: historyFor(num) });
  }
  // Problems first, biggest difference first; matches last.
  const gap = (r: OwedRow) => Math.abs((r.erpCents ?? 0) - (r.qboCents ?? 0));
  rows.sort((a, b) => Number(a.status === "MATCH") - Number(b.status === "MATCH") || Number(b.nameDiffers) - Number(a.nameDiffers) || gap(b) - gap(a));

  const unapplied: UnappliedRow[] = qboItems
    .filter((i) => i.kind !== "INVOICE")
    .map((i) => ({ key: `${i.kind}-${i.qboId}`, kind: i.kind as UnappliedRow["kind"], customer: i.customer, dateKey: i.txnDate, ref: i.docNumber, cents: i.openCents }))
    .sort((a, b) => a.customer.localeCompare(b.customer) || b.cents - a.cents);

  return {
    syncedAt: lastImport?.createdAt.toISOString() ?? null,
    rows,
    unapplied,
    erpOpenCents: erpOpen.reduce((s, i) => s + i.balanceCents, 0),
    qboOpenCents: qboInvoices.reduce((s, i) => s + i.openCents, 0),
    unappliedCents: unapplied.reduce((s, i) => s + i.cents, 0),
    aging: latestAging ? { asOf: latestAging.asOf, totalCents: agingTotal?._sum.totalCents ?? 0 } : null,
  };
}

// ── Monthly totals ─────────────────────────────────────────────────────────

export const CHECK_LINES = ["REVENUE", "PAYROLL", "OFFSHORE", "INSURANCE", "HEALTH", "RECRUITING"] as const;
export type CheckLine = (typeof CHECK_LINES)[number];

export const CHECK_LINE_LABELS: Record<CheckLine, { label: string; erp: string; qbo: string; reasons: string }> = {
  REVENUE: {
    label: "Revenue",
    erp: "Revenue, Count by Paid",
    qbo: "Total income",
    reasons: "QuickBooks is cash basis and counts deposits, including ones not matched to an invoice and jobs not in the ERP.",
  },
  PAYROLL: {
    label: "Payroll and subs (ADP)",
    erp: "Hourly and salaried pay, employer taxes, and subcontractor costs (subs are paid through ADP payroll)",
    qbo: "U.S. payroll, wages, payroll tax, and any Contractors or Subcontractor Labor",
    reasons: "Pay lands in QuickBooks on the payday, while the ERP counts hours by the day worked and sub costs with their job. QuickBooks' payroll tax account also holds the taxes withheld from employees' pay.",
  },
  OFFSHORE: { label: "Offshore", erp: "Offshore pay", qbo: "Offshore Payroll", reasons: "Payment dates differ from the month the pay is for." },
  INSURANCE: {
    label: "Insurance",
    erp: "Premiums spread over each term",
    qbo: "Insurance accounts (not health)",
    reasons: "The ERP spreads a premium over its term; QuickBooks shows it on the day it was paid.",
  },
  HEALTH: { label: "Health insurance", erp: "Sueep's share of premiums", qbo: "Employee Health Benefits", reasons: "QuickBooks has the full IBX bill; the ERP counts only Sueep's share." },
  RECRUITING: { label: "Recruiting", erp: "Hiring ads", qbo: "HR Recruiting", reasons: "QuickBooks also has background checks and other recruiting costs." },
};

export type CheckStatus = "MATCH" | "KNOWN" | "LOOK";

/** One thing behind a line, from either side. */
export type DetailItem = { key: string; date: string | null; label: string; sub: string | null; href: string | null; erpCents: number | null; qboCents: number | null };
/** A group of items that explains part of the difference ("In the ERP another month"...). */
export type DetailGroup = { key: string; label: string; hint: string; erpCents: number; qboCents: number; items: DetailItem[] };

export type MonthCheck = {
  month: string;
  /** QuickBooks' transaction detail is in for this month (the drill-downs need it). */
  detailSynced: boolean;
  lines: { line: CheckLine; erpCents: number; qboCents: number; status: CheckStatus; note: string | null; groups: DetailGroup[] }[];
};

/** Which check line a QuickBooks account counts toward, or null for lines not compared. */
function qboLineFor(section: string, account: string, parent: string): CheckLine | null {
  if (section === "INCOME" || section === "OTHER_INCOME") return "REVENUE";
  const name = `${parent} ${account}`;
  if (/offshore/i.test(name)) return "OFFSHORE";
  // Subs are paid through ADP payroll, so they land in QuickBooks' payroll account; any booked separately count here too.
  if (/payroll|wage|salary|officer|\bfica\b|\bfuta\b|\bsuta\b|contractor|subcontract/i.test(name)) return "PAYROLL";
  if (/health/i.test(name)) return "HEALTH";
  if (/insurance/i.test(name)) return "INSURANCE";
  if (/recruit|background check/i.test(name)) return "RECRUITING";
  return null;
}

function erpLine(m: FinanceMonth, line: CheckLine): number {
  switch (line) {
    case "REVENUE":
      return m.revenueCents;
    case "PAYROLL":
      // Subcontractors included: Sueep pays them through ADP payroll.
      return m.laborCents - m.offshoreInJobsCents + m.manualHourlyCents + m.salaryCents + m.payrollTaxCents;
    case "OFFSHORE":
      return m.offshoreCents + m.offshoreInJobsCents;
    case "INSURANCE":
      return m.insuranceCents;
    case "HEALTH":
      return m.healthCents;
    case "RECRUITING":
      return m.hiringAdsCents;
  }
}

/** Within 5% or $100 counts as matching. */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(10_000, 0.05 * Math.max(Math.abs(a), Math.abs(b)));
}

function monthName(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function group(key: string, label: string, hint: string, items: DetailItem[]): DetailGroup {
  return { key, label, hint, items, erpCents: items.reduce((s, i) => s + (i.erpCents ?? 0), 0), qboCents: items.reduce((s, i) => s + (i.qboCents ?? 0), 0) };
}

type Txn = { month: string; date: string; section: string; account: string; parent: string; txnType: string; docNum: string | null; name: string | null; memo: string | null; amountCents: number };

/**
 * Revenue, invoice by invoice: what QuickBooks received this month (each
 * paid invoice shows under its number on the day it was paid) against the
 * ERP jobs whose revenue counts this month (Count by Paid), linked through
 * the jobs' HubSpot invoice numbers. Each piece lands in the group that
 * explains it, so the groups add up to both totals.
 */
function revenueGroups(
  month: string,
  incomeTxns: Txn[],
  erpJobs: { id: string; title: string; href: string; monthKey: string; revenueCents: number }[],
  invoicesByJob: Map<string, string[]>,
): DetailGroup[] {
  const erpMonthByInvoice = new Map<string, { job: (typeof erpJobs)[number] }>();
  for (const j of erpJobs) for (const n of invoicesByJob.get(j.id) ?? []) if (!erpMonthByInvoice.has(n) || j.monthKey === month) erpMonthByInvoice.set(n, { job: j });
  const qboMonthsByInvoice = new Map<string, Set<string>>();
  for (const t of incomeTxns) {
    const n = t.txnType === "Invoice" ? normNumber(t.docNum) : null;
    if (n) qboMonthsByInvoice.set(n, (qboMonthsByInvoice.get(n) ?? new Set()).add(t.month));
  }

  const thisMonth = incomeTxns.filter((t) => t.month === month);
  // QuickBooks income this month, by invoice number (or one row per other transaction).
  const qboByInvoice = new Map<string, { cents: number; name: string | null; date: string }>();
  const noInvoice: DetailItem[] = [];
  for (const t of thisMonth) {
    const n = t.txnType === "Invoice" ? normNumber(t.docNum) : null;
    if (!n) {
      noInvoice.push({ key: `t-${noInvoice.length}`, date: t.date, label: `${t.txnType}${t.docNum ? ` ${t.docNum}` : ""}`, sub: [t.name, t.memo].filter(Boolean).join(" · ") || null, href: null, erpCents: null, qboCents: t.amountCents });
      continue;
    }
    const prev = qboByInvoice.get(n);
    qboByInvoice.set(n, { cents: (prev?.cents ?? 0) + t.amountCents, name: t.name, date: prev?.date ?? t.date });
  }

  const matched: DetailItem[] = [];
  const qboOtherMonth: DetailItem[] = [];
  const qboOnly: DetailItem[] = [];
  const usedJobs = new Set<string>();
  // ERP jobs this month that have at least one invoice paid in QuickBooks this month: compare at the job level.
  const jobsThisMonth = erpJobs.filter((j) => j.monthKey === month && j.revenueCents !== 0);
  for (const j of jobsThisMonth) {
    const nums = (invoicesByJob.get(j.id) ?? []).filter((n) => qboByInvoice.has(n));
    if (!nums.length) continue;
    usedJobs.add(j.id);
    const cents = nums.reduce((s, n) => s + qboByInvoice.get(n)!.cents, 0);
    for (const n of nums) qboByInvoice.delete(n);
    matched.push({ key: `j-${j.id}`, date: null, label: j.title, sub: nums.join(", "), href: j.href, erpCents: j.revenueCents, qboCents: cents });
  }
  for (const [n, q] of qboByInvoice) {
    const erp = erpMonthByInvoice.get(n);
    if (erp) {
      qboOtherMonth.push({ key: `q-${n}`, date: q.date, label: n, sub: `${erp.job.title} · ERP counts it in ${monthName(erp.job.monthKey)}`, href: erp.job.href, erpCents: null, qboCents: q.cents });
    } else {
      qboOnly.push({ key: `q-${n}`, date: q.date, label: n, sub: q.name, href: null, erpCents: null, qboCents: q.cents });
    }
  }

  const erpOtherMonth: DetailItem[] = [];
  const erpNoPayment: DetailItem[] = [];
  const erpNoInvoice: DetailItem[] = [];
  for (const j of jobsThisMonth) {
    if (usedJobs.has(j.id)) continue;
    const nums = invoicesByJob.get(j.id) ?? [];
    const otherMonths = [...new Set(nums.flatMap((n) => [...(qboMonthsByInvoice.get(n) ?? [])]))].filter((m) => m !== month).sort();
    if (!nums.length) erpNoInvoice.push({ key: `e-${j.id}`, date: null, label: j.title, sub: "No HubSpot invoice linked in the ERP", href: j.href, erpCents: j.revenueCents, qboCents: null });
    else if (otherMonths.length) erpOtherMonth.push({ key: `e-${j.id}`, date: null, label: j.title, sub: `${nums.join(", ")} · QuickBooks has the payment in ${otherMonths.map(monthName).join(", ")}`, href: j.href, erpCents: j.revenueCents, qboCents: null });
    else erpNoPayment.push({ key: `e-${j.id}`, date: null, label: j.title, sub: `${nums.join(", ")} · no payment in QuickBooks since August`, href: j.href, erpCents: j.revenueCents, qboCents: null });
  }

  return [
    group("matched", "In both this month", "The job's invoices were paid in QuickBooks this month too. A difference here means the amounts differ (a partial payment, or the ERP counts a different amount than the invoice).", matched),
    group("qbo-other", "QuickBooks this month, ERP another month", "Paid in QuickBooks this month, but the ERP counts the job in a different month. Timing: usually the paid date in HubSpot differs from the day the money landed.", qboOtherMonth),
    group("erp-other", "ERP this month, QuickBooks another month", "The ERP counts the job this month, but QuickBooks recorded the payment in a different month. Timing, the other way round.", erpOtherMonth),
    group("qbo-only", "Only in QuickBooks: invoice not in the ERP", "A paid invoice the ERP doesn't have: made in QuickBooks directly, or a HubSpot invoice not linked to any job.", qboOnly),
    group("no-invoice", "Only in QuickBooks: no invoice", "Deposits, sales receipts and journal entries with no invoice behind them. The ERP can't match these; ask the bookkeeper what they are.", noInvoice),
    group("erp-no-payment", "Only in the ERP: no payment in QuickBooks", "The ERP counts the job as paid, but QuickBooks has no payment on its invoices. Usually marked paid in HubSpot by mistake, or the payment wasn't applied in QuickBooks.", erpNoPayment),
    group("erp-no-invoice", "Only in the ERP: no invoice linked", "The ERP counts revenue for this job but it has no HubSpot invoice linked, so it can't be matched. Link the invoice on the job.", erpNoInvoice),
  ].filter((g) => g.items.length > 0);
}

/** Non-revenue lines: QuickBooks' transactions for the line, by payee, and the ERP's pieces. */
function costGroups(line: CheckLine, txns: Txn[], m: FinanceMonth | undefined): DetailGroup[] {
  const qboItems: DetailItem[] = txns
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t, i) => ({ key: `t-${i}`, date: t.date, label: t.name || t.txnType, sub: [t.parent ? `${t.parent}: ${t.account}` : t.account, t.memo].filter(Boolean).join(" · "), href: null, erpCents: null, qboCents: t.amountCents }));
  const erpItems: DetailItem[] = [];
  const add = (label: string, cents: number, sub: string | null = null) => {
    if (cents) erpItems.push({ key: `e-${erpItems.length}`, date: null, label, sub, href: null, erpCents: cents, qboCents: null });
  };
  if (m) {
    if (line === "PAYROLL") {
      add("Hourly pay", m.laborCents - m.contractorCents - m.salaryInJobsCents - m.offshoreInJobsCents + m.manualHourlyCents, "Hours on jobs, janitorial shifts and hours added on Payroll, by the day worked");
      add("Salaries", m.salaryCents + m.salaryInJobsCents, "Yearly salary spread over the days of the month");
      add("Employer taxes", m.payrollTaxCents, "Employer Social Security, Medicare and unemployment");
      add("Subcontractors", m.contractorCents, "Contractor assignments, counted with their job. Paid through ADP payroll");
    }
    if (line === "OFFSHORE") add("Offshore pay", m.offshoreCents + m.offshoreInJobsCents, "Monthly rates and months marked paid");
    if (line === "INSURANCE") add("Insurance premiums", m.insuranceCents, "Each policy's premium spread over its term");
    if (line === "HEALTH") add("Sueep's share of health premiums", m.healthCents);
    if (line === "RECRUITING") add("Hiring ads", m.hiringAdsCents, "Job ads on office openings, in the month posted");
  }
  return [
    group("qbo", "In QuickBooks", "Every QuickBooks transaction behind this line this month, by date. On cash basis each one is the day the money moved.", qboItems),
    group("erp", "In the ERP", "How the ERP builds this number. It counts by the day of the work or spreads costs over time, so compare the totals, then look for the QuickBooks payments that don't fit.", erpItems),
  ].filter((g) => g.items.length > 0);
}

/**
 * Finished months since the ERP's data start that QuickBooks has data for,
 * newest first. ERP revenue is Count by Paid so it lines up with
 * QuickBooks' cash basis. Each line carries its drill-down groups.
 */
export async function loadMonthlyCheck(): Promise<MonthCheck[]> {
  const currentMonth = todayEasternKey().slice(0, 7);
  const [qboLines, shareSetting, txns] = await Promise.all([
    prisma.qboPnlLine.findMany({ where: { month: { gte: FINANCE_DATA_START, lt: currentMonth } }, select: { month: true, section: true, account: true, parent: true, amountCents: true } }),
    prisma.appSetting.findUnique({ where: { key: HEALTH_SHARE_SETTING_KEY } }),
    prisma.qboPnlTxn.findMany({
      where: { month: { gte: FINANCE_DATA_START } },
      select: { month: true, date: true, section: true, account: true, parent: true, txnType: true, docNum: true, name: true, memo: true, amountCents: true },
    }),
  ]);
  const months = [...new Set(qboLines.map((l) => l.month))].sort().reverse();
  if (!months.length) return [];
  const summary = await computeFinanceSummary("paid", { startKey: FINANCE_DATA_START });
  const share = parseHealthSharePct(shareSetting?.value) / 100;

  // Each ERP job's HubSpot invoice numbers: SOV lines and change orders, unit turns, contract months.
  const projectIds = [...new Set(summary.jobs.filter((j) => j.href.startsWith("/erp/projects/")).map((j) => j.id.split("::")[0]))];
  const periodIds = summary.jobs.filter((j) => j.segment === "JANITORIAL_CONTRACTS").map((j) => j.id);
  const [projects, sovInv, contractInv] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, turnoverRequestId: true } }),
    prisma.hubSpotSovInvoice.findMany({ where: { projectId: { in: projectIds }, status: { not: "voided" } }, select: { projectId: true, invoiceNumber: true } }),
    prisma.hubSpotContractInvoice.findMany({ where: { periodId: { in: periodIds }, status: { not: "voided" } }, select: { periodId: true, invoiceNumber: true } }),
  ]);
  const turnIds = projects.map((p) => p.turnoverRequestId).filter((x): x is string => !!x);
  const unitInv = turnIds.length
    ? await prisma.hubSpotUnitInvoice.findMany({ where: { turnoverRequestId: { in: turnIds }, status: { not: "voided" } }, select: { turnoverRequestId: true, invoiceNumber: true } })
    : [];
  const numbersByProject = new Map<string, Set<string>>();
  const addNum = (projectId: string, n: string | null) => {
    const k = normNumber(n);
    if (k) numbersByProject.set(projectId, (numbersByProject.get(projectId) ?? new Set()).add(k));
  };
  for (const r of sovInv) addNum(r.projectId, r.invoiceNumber);
  const projectByTurn = new Map(projects.filter((p) => p.turnoverRequestId).map((p) => [p.turnoverRequestId!, p.id]));
  for (const r of unitInv) if (r.turnoverRequestId && projectByTurn.has(r.turnoverRequestId)) addNum(projectByTurn.get(r.turnoverRequestId)!, r.invoiceNumber);
  const invoicesByJob = new Map<string, string[]>();
  for (const j of summary.jobs) {
    if (j.segment === "JANITORIAL_CONTRACTS") {
      invoicesByJob.set(j.id, [...new Set(contractInv.filter((r) => r.periodId === j.id).map((r) => normNumber(r.invoiceNumber)).filter((n): n is string => !!n))]);
    } else invoicesByJob.set(j.id, [...(numbersByProject.get(j.id.split("::")[0]) ?? [])]);
  }
  const incomeTxns = txns.filter((t) => t.section === "INCOME" || t.section === "OTHER_INCOME");

  return months.map((month) => {
    const erpMonth = summary.months.find((m) => m.key === month);
    const qbo = Object.fromEntries(CHECK_LINES.map((l) => [l, 0])) as Record<CheckLine, number>;
    for (const l of qboLines) {
      if (l.month !== month) continue;
      const line = qboLineFor(l.section, l.account, l.parent);
      if (line) qbo[line] += l.amountCents;
    }
    const monthTxns = txns.filter((t) => t.month === month);
    const detailSynced = monthTxns.length > 0;
    return {
      month,
      detailSynced,
      lines: CHECK_LINES.map((line) => {
        const erpCents = erpMonth ? erpLine(erpMonth, line) : 0;
        const qboCents = qbo[line];
        let status: CheckStatus = close(erpCents, qboCents) ? "MATCH" : "LOOK";
        let note: string | null = null;
        // Health: QuickBooks has the whole bill, the ERP Sueep's share of it.
        if (line === "HEALTH" && status === "LOOK" && share > 0 && share < 1 && erpCents > 0 && close(erpCents / share, qboCents)) {
          status = "KNOWN";
          note = `QuickBooks has the full bill; the ERP counts Sueep's ${Math.round(share * 100)}%.`;
        }
        // Without QuickBooks' detail every item would look "ERP only", so show nothing instead.
        const groups = !detailSynced
          ? []
          : line === "REVENUE"
            ? revenueGroups(month, incomeTxns, summary.jobs, invoicesByJob)
            : costGroups(line, monthTxns.filter((t) => qboLineFor(t.section, t.account, t.parent) === line), erpMonth);
        return { line, erpCents, qboCents, status, note, groups };
      }),
    };
  });
}
