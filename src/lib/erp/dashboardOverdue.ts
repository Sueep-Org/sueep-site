import { prisma } from "@/lib/prisma";
import type { CardSection, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { todayEasternKey, utcDateKey } from "./dates";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { loadOpenInvoices, overdueSection, type OpenInvoice, type OverdueInvoice } from "./dashboardMoney";

/**
 * Overdue tab card (Admin and Business Manager): open HubSpot invoices past
 * their due date, and open invoices by how long ago the work they bill was
 * finished (30, 60 and 90+ days). Balances come from loadOpenInvoices, so
 * the totals match the Needs action card and the cash forecast.
 */

const DAY_MS = 86_400_000;

/** Days past completion buckets. Each invoice lands in one, never two. */
const COMPLETION_BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: "done-30", label: "30 days past", min: 30, max: 59 },
  { key: "done-60", label: "60 days past", min: 60, max: 89 },
  { key: "done-90", label: "90+ days past", min: 90, max: Infinity },
];

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function lastDayOfMonthKey(periodStart: Date): string {
  return utcDateKey(new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0)));
}

/**
 * When the work on each open invoice was finished, by HubSpot invoice id.
 * An invoice covering several lines counts from the last one finished.
 * Turns use the turn's completed date (else its project's), SOV lines and
 * change orders their completed date (else the project's end date), and
 * janitorial months the last day of the month. Invoices with no date at all
 * are left out.
 */
async function loadCompletionKeys(): Promise<Map<string, string>> {
  const where = { status: "open" };
  const [units, lines, months] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({
      where,
      select: {
        hubspotInvoiceId: true,
        turnoverRequest: { select: { completedAt: true, projects: { select: { turnoverCompletedAt: true, projectEndDate: true } } } },
      },
    }),
    prisma.hubSpotSovInvoice.findMany({
      where,
      select: {
        hubspotInvoiceId: true,
        sovItem: { select: { completedAt: true } },
        changeOrder: { select: { completedAt: true } },
        project: { select: { projectEndDate: true } },
      },
    }),
    prisma.hubSpotContractInvoice.findMany({ where, select: { hubspotInvoiceId: true, period: { select: { periodStart: true } } } }),
  ]);

  const keys = new Map<string, string>();
  const add = (id: string, key: string | null) => {
    if (!key) return;
    const prev = keys.get(id);
    if (!prev || key > prev) keys.set(id, key);
  };

  for (const u of units) {
    const tr = u.turnoverRequest;
    if (!tr) continue;
    if (tr.completedAt) {
      add(u.hubspotInvoiceId, todayEasternKey(tr.completedAt));
      continue;
    }
    for (const p of tr.projects) {
      if (p.turnoverCompletedAt) add(u.hubspotInvoiceId, todayEasternKey(p.turnoverCompletedAt));
      else if (p.projectEndDate) add(u.hubspotInvoiceId, utcDateKey(p.projectEndDate));
    }
  }
  for (const l of lines) {
    const done = l.sovItem?.completedAt ?? l.changeOrder?.completedAt;
    if (done) add(l.hubspotInvoiceId, utcDateKey(done));
    else if (l.project.projectEndDate) add(l.hubspotInvoiceId, utcDateKey(l.project.projectEndDate));
  }
  for (const m of months) add(m.hubspotInvoiceId, lastDayOfMonthKey(m.period.periodStart));
  return keys;
}

type AgedInvoice = OpenInvoice & { doneKey: string; daysSinceDone: number };

function completionSection(bucket: (typeof COMPLETION_BUCKETS)[number], invoices: AgedInvoice[]): CardSection {
  const total = invoices.reduce((s, i) => s + i.balanceCents, 0);
  return {
    key: bucket.key,
    label: bucket.label,
    alertCount: invoices.length,
    rows: invoices.map((i) => ({
      id: i.id,
      href: i.href,
      title: i.title,
      note: `${i.number ? `Invoice ${i.number} · ` : ""}finished ${shortDate(i.doneKey)}${i.dueKey && i.daysLate > 0 ? ` · ${i.daysLate}d past due` : ""}`,
      value: centsToDollarsCompact(i.balanceCents),
      valueTitle: centsToDollars(i.balanceCents),
      negative: true,
      secondary: `${i.daysSinceDone}d`,
    })),
    empty: "No open invoices in this range.",
    footer: invoices.length ? `${centsToDollarsCompact(total)} unpaid` : undefined,
    href: "/erp/billing",
  };
}

async function loadOverdueData(todayKey: string) {
  const [open, doneKeys] = await Promise.all([loadOpenInvoices(todayKey), loadCompletionKeys()]);
  const overdue = open.filter((i): i is OverdueInvoice => !!i.dueKey && i.daysLate > 0);
  const aged: AgedInvoice[] = open
    .filter((i) => doneKeys.has(i.id))
    .map((i) => {
      const doneKey = doneKeys.get(i.id)!;
      return { ...i, doneKey, daysSinceDone: daysBetween(doneKey, todayKey) };
    })
    .sort((a, b) => b.daysSinceDone - a.daysSinceDone);
  const buckets = COMPLETION_BUCKETS.map((b) => ({ bucket: b, invoices: aged.filter((i) => i.daysSinceDone >= b.min && i.daysSinceDone <= b.max) }));
  return { overdue, buckets };
}

export async function loadOverdueInvoicesCard(): Promise<DashboardCardData> {
  const { overdue, buckets } = await loadOverdueData(todayEasternKey());
  const hubspot = { ...overdueSection(overdue), label: "HubSpot overdue" };
  return {
    alertCount: overdue.length,
    sections: [hubspot, ...buckets.map(({ bucket, invoices }) => completionSection(bucket, invoices))],
  };
}

export async function countOverdueInvoiceAlerts(): Promise<number> {
  const todayKey = todayEasternKey();
  return (await loadOpenInvoices(todayKey)).filter((i) => !!i.dueKey && i.daysLate > 0).length;
}
