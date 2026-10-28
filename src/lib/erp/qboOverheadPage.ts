import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { FINANCE_DATA_START } from "./financeSummary";
import { QBO_COST_SECTIONS, QBO_GROUPS, QBO_GROUP_LABELS, qboGroupFor, type QboGroup } from "./qboOverhead";

/**
 * The Overhead page (QUICKBOOKS_PLAN.md step C): every overhead cost
 * QuickBooks has, by category and month, and for one month each category's
 * vendors and expenses. Same categories as the Finance dashboard; payroll,
 * insurance, health and subs aren't here because the ERP tracks them itself.
 * Amounts are what QuickBooks shows (the dashboard takes out job ads and
 * materials the ERP already counts).
 */

export type OverheadExpense = { date: string; memo: string | null; type: string; account: string; cents: number };
export type OverheadVendor = { name: string; cents: number; expenses: OverheadExpense[] };
export type OverheadCategory = {
  group: QboGroup;
  label: string;
  hint: string;
  /** Cents per month key */
  byMonth: Record<string, number>;
  totalCents: number;
  /** The QuickBooks accounts in this category, with their amount in the picked month */
  accounts: { name: string; cents: number }[];
  /** The picked month's expenses, by vendor (needs the synced detail) */
  vendors: OverheadVendor[];
};

export type OverheadPage = {
  months: string[];
  currentMonth: string;
  month: string;
  categories: OverheadCategory[];
  totals: Record<string, number>;
  /** Whether QuickBooks' expense-by-expense detail is in for the picked month */
  detailSynced: boolean;
};

function monthsSince(start: string, through: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > through) return out;
    out.push(key);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
}

export async function loadOverheadPage(picked: string | undefined): Promise<OverheadPage> {
  const currentMonth = todayEasternKey().slice(0, 7);
  const months = monthsSince(FINANCE_DATA_START, currentMonth);
  const lastFinished = months.length > 1 ? months[months.length - 2] : currentMonth;
  const month = picked && months.includes(picked) ? picked : lastFinished;

  const [lines, txns] = await Promise.all([
    prisma.qboPnlLine.findMany({
      where: { month: { in: months }, section: { in: [...QBO_COST_SECTIONS] } },
      select: { month: true, account: true, parent: true, amountCents: true },
    }),
    prisma.qboPnlTxn.findMany({
      where: { month, section: { in: [...QBO_COST_SECTIONS] } },
      select: { date: true, account: true, parent: true, txnType: true, name: true, memo: true, amountCents: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const categories = new Map<QboGroup, OverheadCategory>();
  const cat = (g: QboGroup) => {
    let c = categories.get(g);
    if (!c) {
      c = { group: g, label: QBO_GROUP_LABELS[g].label, hint: QBO_GROUP_LABELS[g].hint, byMonth: {}, totalCents: 0, accounts: [], vendors: [] };
      categories.set(g, c);
    }
    return c;
  };
  const accountCents = new Map<QboGroup, Map<string, number>>();
  for (const l of lines) {
    const g = qboGroupFor(l.account, l.parent);
    if (g === "SKIP") continue;
    const c = cat(g);
    c.byMonth[l.month] = (c.byMonth[l.month] ?? 0) + l.amountCents;
    c.totalCents += l.amountCents;
    const name = l.parent ? `${l.parent}: ${l.account}` : l.account;
    const acc = accountCents.get(g) ?? new Map<string, number>();
    acc.set(name, (acc.get(name) ?? 0) + (l.month === month ? l.amountCents : 0));
    accountCents.set(g, acc);
  }
  for (const [g, acc] of accountCents) {
    cat(g).accounts = [...acc].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }

  const vendorMaps = new Map<QboGroup, Map<string, OverheadVendor>>();
  for (const t of txns) {
    const g = qboGroupFor(t.account, t.parent);
    if (g === "SKIP") continue;
    cat(g);
    const name = t.name?.trim() || "No payee";
    const vm = vendorMaps.get(g) ?? new Map<string, OverheadVendor>();
    const v = vm.get(name) ?? { name, cents: 0, expenses: [] };
    v.cents += t.amountCents;
    v.expenses.push({ date: t.date, memo: t.memo, type: t.txnType, account: t.parent ? `${t.parent}: ${t.account}` : t.account, cents: t.amountCents });
    vm.set(name, v);
    vendorMaps.set(g, vm);
  }
  for (const [g, vm] of vendorMaps) cat(g).vendors = [...vm.values()].sort((a, b) => b.cents - a.cents);

  const ordered = QBO_GROUPS.map((g) => categories.get(g)).filter((c): c is OverheadCategory => !!c);
  const totals: Record<string, number> = {};
  for (const c of ordered) for (const [m, cents] of Object.entries(c.byMonth)) totals[m] = (totals[m] ?? 0) + cents;

  return { months, currentMonth, month, categories: ordered, totals, detailSynced: txns.length > 0 };
}
