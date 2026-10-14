import { prisma } from "@/lib/prisma";
import type { ErpRole } from "../erpSession";
import { todayEasternKey, utcDateKey } from "./dates";
import { unstable_cache } from "next/cache";
import { computeFinanceSummary, FINANCE_RANGE_KEY, sumMonths } from "./financeSummary";
import { DEFAULT_PAYROLL_ANCHOR, payPeriodForDay } from "./payPeriods";
import { loadOpenInvoices, loadReadyToBill } from "./dashboardMoney";

/**
 * Cash forecast card (DASHBOARDS_PLAN.md Phase 5): money in vs money out for
 * the next 8 weeks. An estimate, not a bank balance: it only knows what the
 * ERP knows, and every guess it makes is named in `assumptions`.
 */

export const FORECAST_WEEKS = 8;
export const TERMS_SETTING_KEY = "cashForecastTermsDays";
export const DEFAULT_TERMS_DAYS = 30;
export const MAX_TERMS_DAYS = 120;
/** Recent costs are averaged over this many days for the run-rate lines. */
const RUN_RATE_DAYS = 28;
/** How long the 28-day cost averages are reused. */
const RECENT_COSTS_SECONDS = 3600;
/** Payroll is assumed paid this many days after its period ends (the Friday after a Sunday end). */
const PAY_LAG_DAYS = 5;

const DAY_MS = 86_400_000;

export type ForecastPart = { label: string; cents: number };
export type ForecastWeek = {
  startKey: string;
  endKey: string;
  inCents: number;
  outCents: number;
  /** In minus out, added up from week 1. */
  runningNetCents: number;
  inParts: ForecastPart[];
  outParts: ForecastPart[];
};
export type CashForecast = {
  weeks: ForecastWeek[];
  termsDays: number;
  canEditTerms: boolean;
  assumptions: string[];
};

function addDays(key: string, days: number): string {
  return utcDateKey(new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS));
}

function mondayOf(key: string): string {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
}

/** What the run-rate lines need from the Finance tab's numbers for the last RUN_RATE_DAYS. */
type RecentCosts = {
  laborCents: number;
  contractorCents: number;
  manualHourlyCents: number;
  salaryCents: number;
  offshoreCents: number;
  materialCents: number;
  reimbursementCents: number;
  insuranceCents: number;
  commissionOwedCents: number;
};

async function computeRecentCosts(from: string, to: string): Promise<RecentCosts> {
  const summary = await computeFinanceSummary("completed", { range: { from, to } });
  const m = summary.months.find((x) => x.key === FINANCE_RANGE_KEY) ?? sumMonths(FINANCE_RANGE_KEY, summary.months);
  return {
    laborCents: m.laborCents,
    contractorCents: m.contractorCents,
    manualHourlyCents: m.manualHourlyCents,
    salaryCents: m.salaryCents,
    offshoreCents: m.offshoreCents,
    materialCents: m.materialCents,
    reimbursementCents: m.reimbursementCents,
    insuranceCents: m.insuranceCents,
    commissionOwedCents: summary.commission.earned.filter((c) => !c.paid).reduce((s, c) => s + c.cents, 0),
  };
}

/** The heaviest part of the forecast (the Finance tab's whole calculation), reused for an hour: they're 28-day averages, so they barely move. */
const cachedRecentCosts = unstable_cache(computeRecentCosts, ["cash-forecast-recent-costs-v1"], { revalidate: RECENT_COSTS_SECONDS });

export function canEditForecastTerms(role: ErpRole): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export async function loadTermsDays(): Promise<number> {
  const raw = (await prisma.appSetting.findUnique({ where: { key: TERMS_SETTING_KEY } }))?.value;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_TERMS_DAYS ? n : DEFAULT_TERMS_DAYS;
}

/** The billing day in a month, pulled back to the month's last day when the month is short. */
function billingDayKey(year: number, monthIndex: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return utcDateKey(new Date(Date.UTC(year, monthIndex, Math.min(day, last))));
}

export async function loadCashForecast(role: ErpRole): Promise<CashForecast> {
  const todayKey = todayEasternKey();
  const firstWeek = mondayOf(todayKey);
  const lastDay = addDays(firstWeek, FORECAST_WEEKS * 7 - 1);
  const termsDays = await loadTermsDays();

  const weeks = Array.from({ length: FORECAST_WEEKS }, (_, i) => {
    const startKey = addDays(firstWeek, i * 7);
    return { startKey, endKey: addDays(startKey, 6), inParts: new Map<string, number>(), outParts: new Map<string, number>() };
  });
  /** Which week a day lands in; anything before week 1 lands in week 1, after week 8 is dropped. */
  const weekFor = (key: string) => (key > lastDay ? null : weeks[Math.max(0, Math.floor(daysBetween(firstWeek, key) / 7))]);
  const add = (side: "inParts" | "outParts", key: string, label: string, cents: number) => {
    const w = weekFor(key);
    if (!w || cents <= 0) return;
    w[side].set(label, (w[side].get(label) ?? 0) + cents);
  };

  const runFrom = addDays(todayKey, -RUN_RATE_DAYS);
  const runTo = addDays(todayKey, -1);
  const [openInvoices, readyToBill, contracts, anchorSetting, summary] = await Promise.all([
    loadOpenInvoices(todayKey),
    loadReadyToBill(todayKey),
    prisma.recurringContract.findMany({
      where: { status: "ACTIVE" },
      select: { monthlyRateCents: true, billingDayOfMonth: true, startDate: true, endDate: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }),
    cachedRecentCosts(runFrom, runTo),
  ]);

  // ── Money in ──
  for (const inv of openInvoices) {
    if (!inv.dueKey) add("inParts", addDays(todayKey, termsDays), "Open invoices, no due date", inv.balanceCents);
    else if (inv.dueKey < todayKey) add("inParts", todayKey, "Overdue invoices (may slip)", inv.balanceCents);
    else add("inParts", inv.dueKey, "Open invoices", inv.balanceCents);
  }
  const readyCents = readyToBill.reduce((s, i) => s + (i.cents ?? 0), 0);
  add("inParts", addDays(todayKey, termsDays), "Ready to bill, if billed now", readyCents);

  // Janitorial months not billed yet: billed on the contract's billing day,
  // paid `termsDays` later. Months already started are in ready to bill.
  const [ty, tm] = todayKey.split("-").map(Number);
  for (const c of contracts) {
    for (let i = 0; i <= 3; i++) {
      const billKey = billingDayKey(ty, tm - 1 + i, c.billingDayOfMonth);
      if (billKey <= todayKey) continue;
      if (billKey < utcDateKey(c.startDate)) continue;
      if (c.endDate && billKey > utcDateKey(c.endDate)) continue;
      add("inParts", addDays(billKey, termsDays), "Janitorial monthly billing", c.monthlyRateCents);
    }
  }

  // ── Money out ──
  const recent = summary;
  const perDay = (cents: number) => cents / RUN_RATE_DAYS;
  const payrollPerDay = perDay(
    recent.laborCents - recent.contractorCents + recent.manualHourlyCents + recent.salaryCents + recent.offshoreCents,
  );

  // Payroll in the week each pay period is paid.
  const anchor = anchorSetting?.value ?? DEFAULT_PAYROLL_ANCHOR;
  let period = payPeriodForDay(addDays(firstWeek, -PAY_LAG_DAYS - 14), anchor);
  let firstPayKey: string | null = null;
  for (let guard = 0; guard < 10; guard++) {
    const payKey = addDays(utcDateKey(period.end), PAY_LAG_DAYS);
    if (payKey > lastDay) break;
    if (payKey >= firstWeek) {
      add("outParts", payKey, "Payroll (recent rate)", Math.round(payrollPerDay * 14));
      firstPayKey ??= payKey;
    }
    period = payPeriodForDay(addDays(utcDateKey(period.end), 1), anchor);
  }

  // Commission earned and not paid yet goes out with the next payroll.
  const commissionOwed = summary.commissionOwedCents;
  if (firstPayKey) add("outParts", firstPayKey, "Commission owed", commissionOwed);

  // Everything else at its recent daily rate, every week. Subcontractors too:
  // their cost is entered after the work, so there's nothing scheduled ahead.
  const weeklyOther = [
    { label: "Subcontractors (recent rate)", cents: Math.round(perDay(recent.contractorCents) * 7) },
    { label: "Materials and travel (recent rate)", cents: Math.round(perDay(recent.materialCents) * 7) },
    { label: "Reimbursements (recent rate)", cents: Math.round(perDay(recent.reimbursementCents) * 7) },
    { label: "Insurance (spread)", cents: Math.round(perDay(recent.insuranceCents) * 7) },
  ];
  for (const w of weeks) for (const o of weeklyOther) add("outParts", w.startKey, o.label, o.cents);

  let running = 0;
  const out: ForecastWeek[] = weeks.map((w) => {
    const inParts = [...w.inParts.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
    const outParts = [...w.outParts.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
    const inCents = inParts.reduce((s, p) => s + p.cents, 0);
    const outCents = outParts.reduce((s, p) => s + p.cents, 0);
    running += inCents - outCents;
    return { startKey: w.startKey, endKey: w.endKey, inCents, outCents, runningNetCents: running, inParts, outParts };
  });

  return {
    weeks: out,
    termsDays,
    canEditTerms: canEditForecastTerms(role),
    assumptions: [
      `Unbilled work and janitorial months are paid ${termsDays} days after billing.`,
      `Payroll, offshore, subcontractors, materials, reimbursements and insurance use the last ${RUN_RATE_DAYS} days' rate. Payroll lands ${PAY_LAG_DAYS} days after each pay period ends.`,
      "Recent rates and commission owed refresh hourly; invoices and ready to bill are live.",
      "Running net starts at $0. It's what the ERP expects to come in minus go out, not a bank balance.",
      "Jobs not finished yet aren't counted as money in until they're ready to bill.",
    ],
  };
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}
