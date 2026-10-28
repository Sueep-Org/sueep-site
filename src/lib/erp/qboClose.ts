import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { FINANCE_DATA_START } from "./financeSummary";
import { QBO_BOOKED_THROUGH_KEY } from "./qboOverhead";

/**
 * Month close (QUICKBOOKS_PLAN.md Phase 6): which months QuickBooks is
 * finished for ("booked through"), and a checklist per month. Items tick
 * themselves from the QuickBooks data where they can; anyone on the
 * QuickBooks page can tick them by hand. Kept in AppSetting, no table.
 */

const QBO_CLOSE_CHECKS_KEY = "qboCloseChecks";

export const CLOSE_ITEMS = [
  { key: "payroll", label: "Payroll entered", hint: "QuickBooks has the month's ADP payroll (wages, payroll taxes and the subs paid through ADP).", auto: true },
  {
    key: "income",
    label: "Income tied to invoices",
    hint: 'No income left in "Customer payment", "Unapplied Cash Payment Income" or "Uncategorized Income". Deposits there aren\'t matched to an invoice.',
    auto: true,
  },
  {
    key: "categorized",
    label: "Expenses categorized",
    hint: 'Nothing left in "Uncategorized Expense", "Ask My Accountant" or "Reconciliation Discrepancies".',
    auto: true,
  },
  { key: "payees", label: "Every expense has a payee", hint: 'No expense without a vendor or payee ("Not specified"). Needs the QuickBooks detail from a sync.', auto: true },
  { key: "reviewed", label: "QuickBooks check reviewed", hint: "Someone went through the QuickBooks check page for this month and the differences left are explained.", auto: false },
] as const;
export type CloseItemKey = (typeof CLOSE_ITEMS)[number]["key"];

export function isCloseItemKey(v: unknown): v is CloseItemKey {
  return typeof v === "string" && CLOSE_ITEMS.some((i) => i.key === v);
}

type ManualTicks = Record<string, Partial<Record<CloseItemKey, { by: string | null; at: string }>>>;

export async function loadBookedThrough(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: QBO_BOOKED_THROUGH_KEY } });
  return row?.value && /^\d{4}-\d{2}$/.test(row.value) ? row.value : null;
}

async function loadTicks(): Promise<ManualTicks> {
  const row = await prisma.appSetting.findUnique({ where: { key: QBO_CLOSE_CHECKS_KEY } });
  try {
    return row ? (JSON.parse(row.value) as ManualTicks) : {};
  } catch {
    return {};
  }
}

export async function setCloseTick(month: string, item: CloseItemKey, done: boolean, by: string | null) {
  const ticks = await loadTicks();
  const m = { ...(ticks[month] ?? {}) };
  if (done) m[item] = { by, at: new Date().toISOString() };
  else delete m[item];
  ticks[month] = m;
  await prisma.appSetting.upsert({ where: { key: QBO_CLOSE_CHECKS_KEY }, create: { key: QBO_CLOSE_CHECKS_KEY, value: JSON.stringify(ticks) }, update: { value: JSON.stringify(ticks) } });
}

export async function setBookedThrough(month: string | null) {
  if (month) await prisma.appSetting.upsert({ where: { key: QBO_BOOKED_THROUGH_KEY }, create: { key: QBO_BOOKED_THROUGH_KEY, value: month }, update: { value: month } });
  else await prisma.appSetting.deleteMany({ where: { key: QBO_BOOKED_THROUGH_KEY } });
}

export type CloseItemState = {
  key: CloseItemKey;
  label: string;
  hint: string;
  /** What the data says: true done, false not done, null can't tell (no data yet). */
  auto: boolean | null;
  /** Why the automatic check isn't done, in numbers. */
  detail: string | null;
  manual: { by: string | null; at: string } | null;
  done: boolean;
};

export type CloseMonth = { month: string; hasData: boolean; items: CloseItemState[] };

function monthKeysBack(fromExclusive: string, start: string): string[] {
  const out: string[] = [];
  let [y, m] = fromExclusive.split("-").map(Number) as [number, number];
  for (;;) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key < start) return out;
    out.push(key);
  }
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Finished months since the ERP's data start, newest first, each with its checklist. */
export async function loadCloseMonths(): Promise<CloseMonth[]> {
  const months = monthKeysBack(todayEasternKey().slice(0, 7), FINANCE_DATA_START);
  if (!months.length) return [];
  const [lines, txns, ticks] = await Promise.all([
    prisma.qboPnlLine.findMany({ where: { month: { in: months } }, select: { month: true, section: true, account: true, parent: true, amountCents: true } }),
    prisma.qboPnlTxn.findMany({ where: { month: { in: months }, section: { in: ["EXPENSE", "COGS", "OTHER_EXPENSE"] } }, select: { month: true, name: true, amountCents: true } }),
    loadTicks(),
  ]);
  const detailMonths = new Set((await prisma.qboPnlTxn.findMany({ where: { month: { in: months } }, distinct: ["month"], select: { month: true } })).map((r) => r.month));

  return months.map((month) => {
    const ml = lines.filter((l) => l.month === month);
    const hasData = ml.length > 0;
    const sum = (re: RegExp, sections?: string[]) =>
      ml.filter((l) => (!sections || sections.includes(l.section)) && re.test(`${l.parent} ${l.account}`)).reduce((s, l) => s + l.amountCents, 0);
    const payroll = sum(/payroll|wage|salary/i, ["EXPENSE", "COGS"]);
    const loose = sum(/customer payment|unapplied cash payment|uncategorized income/i, ["INCOME", "OTHER_INCOME"]);
    const uncategorized = sum(/uncategorized expense|ask my accountant|reconciliation discrepanc/i);
    const noPayee = txns.filter((t) => t.month === month && !t.name?.trim());
    const noPayeeCents = noPayee.reduce((s, t) => s + t.amountCents, 0);

    const autoState: Record<CloseItemKey, { auto: boolean | null; detail: string | null }> = {
      payroll: { auto: hasData ? payroll > 0 : null, detail: hasData && payroll <= 0 ? "No payroll in QuickBooks this month" : null },
      income: { auto: hasData ? loose === 0 : null, detail: loose ? `${money(loose)} of income not tied to an invoice` : null },
      categorized: { auto: hasData ? uncategorized === 0 : null, detail: uncategorized ? `${money(uncategorized)} uncategorized` : null },
      payees: {
        auto: detailMonths.has(month) ? noPayee.length === 0 : null,
        detail: noPayee.length ? `${noPayee.length} expense${noPayee.length === 1 ? "" : "s"} with no payee, ${money(noPayeeCents)}` : null,
      },
      reviewed: { auto: null, detail: null },
    };
    return {
      month,
      hasData,
      items: CLOSE_ITEMS.map((i) => {
        const manual = ticks[month]?.[i.key] ?? null;
        const a = autoState[i.key];
        return { key: i.key, label: i.label, hint: i.hint, auto: a.auto, detail: a.detail, manual, done: !!manual || a.auto === true };
      }),
    };
  });
}
