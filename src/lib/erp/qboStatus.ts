import { todayEasternKey } from "./dates";
import { FINANCE_DATA_START } from "./financeSummary";
import { loadQboConnection } from "./qboClient";
import { loadMoneyOwedCheck, loadMonthlyCheck, type CheckLine } from "./qboCheck";
import { loadBookedThrough, loadCloseMonths } from "./qboClose";

/**
 * The one status on the QuickBooks page: "Everything matches", or a short
 * list of plain sentences saying what doesn't and where to look. Built from
 * the same checks as the details page (qboCheck.ts, qboClose.ts).
 */

export type StatusItem = { text: string; href: string | null };

export type QboStatus = {
  items: StatusItem[];
  /** More issues than shown */
  more: number;
  /** The next month to close ("YYYY-MM"), null when every finished month is closed */
  nextToClose: string | null;
  bookedThrough: string | null;
};

const MAX_ITEMS = 5;

/** How each monthly line reads inside a sentence. */
const LINE_WORDS: Record<CheckLine, string> = {
  REVENUE: "revenue",
  PAYROLL: "payroll",
  OFFSHORE: "offshore pay",
  INSURANCE: "insurance",
  HEALTH: "health insurance",
  RECRUITING: "recruiting",
};

function list(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
const STALE_MS = 36 * 3600_000;

function money(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function monthName(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function finishedMonths(): string[] {
  const out: string[] = [];
  const current = todayEasternKey().slice(0, 7);
  let [y, m] = FINANCE_DATA_START.split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key >= current) return out;
    out.push(key);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
}

export async function loadQboStatus(): Promise<QboStatus> {
  const [conn, owed, months, close, bookedThrough] = await Promise.all([
    loadQboConnection(),
    loadMoneyOwedCheck(),
    loadMonthlyCheck(),
    loadCloseMonths(),
    loadBookedThrough(),
  ]);
  const items: StatusItem[] = [];
  const details = "/erp/quickbooks/check";

  // Connection first: nothing else is trustworthy without it.
  if (!conn) items.push({ text: "QuickBooks isn't connected, so nothing is being checked.", href: null });
  else if (conn.status === "NEEDS_RECONNECT") items.push({ text: "QuickBooks needs to be connected again. Until then nothing new comes in.", href: null });
  else if (conn.environment === "sandbox") items.push({ text: "Connected to Intuit's test company. Sueep's real numbers only sync on the live site.", href: null });
  else if (!conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() > STALE_MS) {
    items.push({ text: `QuickBooks hasn't synced since ${conn.lastSyncAt ? conn.lastSyncAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "it was connected"}. Click Sync now.`, href: null });
  }

  // Money owed, grouped by what to do about it.
  if (owed.syncedAt) {
    const count = (s: string) => owed.rows.filter((r) => r.status === s);
    const notInQbo = count("ERP_ONLY");
    const paidOnlyInErp = count("PAID_IN_ERP");
    const onlyInQbo = count("QBO_ONLY");
    const balance = count("BALANCE_DIFF");
    const wrongCustomer = owed.rows.filter((r) => r.nameDiffers);
    const sum = (rows: typeof owed.rows) => rows.reduce((s, r) => s + Math.abs((r.erpCents ?? 0) - (r.qboCents ?? 0)), 0);
    const link = `${details}?tab=${encodeURIComponent("Money owed")}`;
    if (notInQbo.length) items.push({ text: `${plural(notInQbo.length, "invoice")} open in the ERP aren't open in QuickBooks (${money(sum(notInQbo))}), mostly HubSpot sync failures or payments HubSpot didn't get.`, href: link });
    if (paidOnlyInErp.length) items.push({ text: `${plural(paidOnlyInErp.length, "invoice")} marked paid in HubSpot are still open in QuickBooks (${money(sum(paidOnlyInErp))}).`, href: link });
    if (owed.unappliedCents) items.push({ text: `${money(owed.unappliedCents)} of payments and credits in QuickBooks aren't applied to any invoice.`, href: link });
    if (onlyInQbo.length) items.push({ text: `${plural(onlyInQbo.length, "invoice")} open in QuickBooks aren't in the ERP (${money(sum(onlyInQbo))}).`, href: link });
    if (balance.length) items.push({ text: `${plural(balance.length, "invoice")} have a different balance in each system.`, href: link });
    if (wrongCustomer.length) items.push({ text: `${plural(wrongCustomer.length, "invoice")} sit under a different customer name in QuickBooks.`, href: link });
  }

  // Months not closed yet: what's left before they can be.
  const open = finishedMonths().filter((m) => !bookedThrough || m > bookedThrough);
  for (const month of open) {
    const c = close.find((x) => x.month === month);
    const loose = c?.items.find((i) => i.key === "income" && i.auto === false);
    const uncategorized = c?.items.find((i) => i.key === "categorized" && i.auto === false);
    const noPayroll = c?.items.find((i) => i.key === "payroll" && i.auto === false);
    if (c && !c.hasData) items.push({ text: `${monthName(month)}: no QuickBooks numbers yet.`, href: null });
    if (noPayroll) items.push({ text: `${monthName(month)}: payroll isn't in QuickBooks yet.`, href: null });
    if (loose?.detail) items.push({ text: `${monthName(month)}: ${loose.detail.charAt(0).toLowerCase()}${loose.detail.slice(1)}.`, href: `${details}?tab=${encodeURIComponent("Monthly totals")}` });
    if (uncategorized?.detail) items.push({ text: `${monthName(month)}: ${uncategorized.detail} in QuickBooks.`, href: null });
    const look = months.find((m) => m.month === month)?.lines.filter((l) => l.status === "LOOK") ?? [];
    if (look.length) {
      const words = list(look.map((l) => LINE_WORDS[l.line]));
      items.push({ text: `${monthName(month)}: ${words.charAt(0).toUpperCase()}${words.slice(1)} ${look.length === 1 ? "doesn't" : "don't"} match QuickBooks.`, href: `${details}?tab=${encodeURIComponent("Monthly totals")}` });
    }
  }

  return { items: items.slice(0, MAX_ITEMS), more: Math.max(0, items.length - MAX_ITEMS), nextToClose: open[0] ?? null, bookedThrough };
}
