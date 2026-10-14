import { prisma } from "@/lib/prisma";
import type { JobTabRow } from "@/app/erp/(shell)/_dashboard/JobTabs";
import type { DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { todayEasternAsUtcMidnight, todayEasternKey, utcDateKey } from "./dates";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { loadCommissionRows } from "./commissionRows";

/** Sales dashboard cards (DASHBOARDS_PLAN.md Phase 3): Contract renewals, My commission. */

/** Renewals this close (or already past) are flagged. */
const RENEWAL_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

function daysUntil(key: string, todayKey: string): number {
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY_MS);
}

function shortDate(key: string, withYear = false): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

// ── Contract renewals ──────────────────────────────────────────────────────

type RenewalItem = { id: string; building: string; monthlyRateCents: number; key: string; kind: "renews" | "ends" };

/** Each open contract's next date that matters: its contract end date if
 * it has one (it's ending, not renewing), else its term expiration (the
 * date the "Renew" button pushes out a year). Ended contracts are left out. */
async function loadRenewalItems(): Promise<RenewalItem[]> {
  const contracts = await prisma.recurringContract.findMany({
    where: { status: { not: "ENDED" } },
    select: { id: true, monthlyRateCents: true, endDate: true, expirationDate: true, building: { select: { name: true } } },
  });
  return contracts
    .flatMap((c): RenewalItem[] => {
      if (c.endDate) return [{ id: c.id, building: c.building.name, monthlyRateCents: c.monthlyRateCents, key: utcDateKey(c.endDate), kind: "ends" }];
      if (c.expirationDate) return [{ id: c.id, building: c.building.name, monthlyRateCents: c.monthlyRateCents, key: utcDateKey(c.expirationDate), kind: "renews" }];
      return [];
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function renewalRow(item: RenewalItem, todayKey: string): JobTabRow {
  const days = daysUntil(item.key, todayKey);
  const verb = item.kind === "ends" ? "Ends" : "Renews";
  const value = days < 0 ? `${item.kind === "ends" ? "Ended" : "Expired"} ${shortDate(item.key)}` : days === 0 ? `${verb} today` : days <= RENEWAL_WINDOW_DAYS ? `${verb} in ${days} days` : `${verb} ${shortDate(item.key, true)}`;
  return {
    id: item.id,
    href: `/erp/janitorial/contracts/${item.id}`,
    title: item.building,
    note: `${centsToDollarsCompact(item.monthlyRateCents)}/mo · ${centsToDollarsCompact(item.monthlyRateCents * 12)}/yr`,
    value,
    negative: days <= RENEWAL_WINDOW_DAYS,
  };
}

export async function loadContractRenewals(): Promise<DashboardCardData> {
  const todayKey = todayEasternKey();
  const items = await loadRenewalItems();
  const soon = items.filter((i) => daysUntil(i.key, todayKey) <= RENEWAL_WINDOW_DAYS);
  return {
    alertCount: soon.length,
    sections: [
      { key: "soon", label: "Next 90 days", rows: soon.map((i) => renewalRow(i, todayKey)), empty: "Nothing renews or ends in the next 90 days.", alertCount: soon.length, href: "/erp/janitorial" },
      { key: "all", label: "All contracts", rows: items.map((i) => renewalRow(i, todayKey)), empty: "No open janitorial contracts.", href: "/erp/janitorial" },
    ],
  };
}

export async function countRenewalAlerts(): Promise<number> {
  const cutoff = new Date(todayEasternAsUtcMidnight().getTime() + RENEWAL_WINDOW_DAYS * DAY_MS);
  return prisma.recurringContract.count({
    where: {
      status: { not: "ENDED" },
      OR: [{ endDate: { lte: cutoff } }, { endDate: null, expirationDate: { lte: cutoff } }],
    },
  });
}

// ── My commission ──────────────────────────────────────────────────────────

type CommissionItem = { id: string; title: string; note: string; dayKey: string; cents: number; paid: boolean; href: string };

function quarterStartKey(todayKey: string): string {
  const [y, m] = todayKey.split("-").map(Number);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

function commissionHref(year: string): string {
  return `/erp/payroll?view=Commission&year=${year}`;
}

/** The logged-in person's commission: one-time deals, janitorial contract
 * months and weekly bid bonuses, from the same rows as the Payroll page's
 * Commission tab (commissionRows.ts), so the totals can't disagree. */
export async function loadMyCommission(email: string): Promise<DashboardCardData> {
  const me = email
    ? await prisma.employee.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true } })
    : null;
  if (!me) {
    return { sections: [{ key: "summary", label: "Summary", rows: [], empty: "Your login isn't linked to an employee record, so there's no commission to show. Ask an admin to match the emails." }] };
  }

  const { deals, recurring, bidBonuses } = await loadCommissionRows();
  const items: CommissionItem[] = [
    ...deals.filter((d) => d.ownerId === me.id).map((d) => ({
      id: `deal-${d.projectId}`, title: d.jobTitle, note: "Deal", dayKey: d.completedAt.slice(0, 10),
      cents: d.commissionCents, paid: !!d.paidAt, href: `/erp/projects/${d.projectId}`,
    })),
    ...recurring.filter((r) => r.ownerId === me.id).map((r) => ({
      id: `month-${r.periodId}`, title: r.buildingName, note: `Contract month ${r.monthIndex + 1}`, dayKey: r.periodStart.slice(0, 10),
      cents: r.commissionCents, paid: !!r.paidAt, href: `/erp/janitorial/contracts/${r.contractId}`,
    })),
    ...bidBonuses.filter((b) => b.employeeId === me.id).map((b) => ({
      id: `bids-${b.weekStart}`, title: `Bid bonus, ${b.verifiedBids} bids`, note: "Bid bonus", dayKey: b.weekStart.slice(0, 10),
      cents: b.bonusCents, paid: !!b.paidAt, href: commissionHref(b.weekStart.slice(0, 4)),
    })),
  ].filter((i) => i.cents > 0);

  const todayKey = todayEasternKey();
  const year = todayKey.slice(0, 4);
  const periods: { key: string; label: string; from: string }[] = [
    { key: "month", label: "This month", from: `${todayKey.slice(0, 7)}-01` },
    { key: "quarter", label: "This quarter", from: quarterStartKey(todayKey) },
    { key: "year", label: `This year (${year})`, from: `${year}-01-01` },
  ];
  const summaryRows: JobTabRow[] = periods.map((p) => {
    const inPeriod = items.filter((i) => i.dayKey >= p.from && i.dayKey <= todayKey);
    const earned = inPeriod.reduce((s, i) => s + i.cents, 0);
    const paid = inPeriod.filter((i) => i.paid).reduce((s, i) => s + i.cents, 0);
    return {
      id: p.key,
      href: commissionHref(year),
      title: p.label,
      note: `Paid ${centsToDollarsCompact(paid)} · Owed ${centsToDollarsCompact(earned - paid)}`,
      value: centsToDollarsCompact(earned),
      valueTitle: centsToDollars(earned),
    };
  });

  const owed = items.filter((i) => !i.paid).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  const owedRows: JobTabRow[] = owed.map((i) => ({
    id: i.id,
    href: i.href,
    title: i.title,
    note: `${i.note} · ${shortDate(i.dayKey, true)}`,
    value: centsToDollarsCompact(i.cents),
    valueTitle: centsToDollars(i.cents),
  }));
  const owedTotal = owed.reduce((s, i) => s + i.cents, 0);

  return {
    sections: [
      { key: "summary", label: "Summary", rows: summaryRows, empty: "No commission yet.", href: commissionHref(year) },
      { key: "owed", label: "Not paid yet", rows: owedRows, empty: "Everything earned has been paid.", footer: owed.length ? `${centsToDollarsCompact(owedTotal)} total` : undefined, href: commissionHref(year) },
    ],
  };
}
