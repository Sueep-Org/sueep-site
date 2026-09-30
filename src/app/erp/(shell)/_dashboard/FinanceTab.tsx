import Link from "next/link";
import { FinanceDateRange } from "./FinanceDateRange";
import { JobTabs, type JobTabRow } from "./JobTabs";
import {
  computeFinanceSummary,
  costBreakdown,
  sumMonths,
  FINANCE_SEGMENTS,
  FINANCE_SEGMENT_LABELS,
  FINANCE_DATA_START,
  type FinanceAnchor,
  type FinanceMonth,
  type FinanceJob,
  type FutureJob,
  type GapItem,
  type CommissionItem,
} from "@/lib/erp/financeSummary";

const HELP_HREF = "/erp/help/finance/finance-dashboard";

/** Exact amount, for hovers and lists that need it. */
function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Rounded amount for the page ($950, $85.8k, $1.2M); exact on hover. */
function short(cents: number): string {
  const d = Math.abs(cents / 100);
  const sign = cents < 0 ? "-" : "";
  if (d < 1000) return `${sign}$${Math.round(d)}`;
  if (d < 1_000_000) return `${sign}$${(d / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}$${(d / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function pctLabel(p: number | null): string {
  return p == null ? "-" : `${p}%`;
}

function monthName(key: string, month: "short" | "long" = "short"): string {
  return new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("en-US", { month, timeZone: "UTC" });
}

/** "Aug 1 - Aug 7, 2026" (or with both years when they differ). */
function rangeLabel(r: { from: string; to: string }): string {
  const fmt = (k: string, withYear: boolean) =>
    new Date(`${k}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${fmt(r.from, !sameYear)} - ${fmt(r.to, true)}`;
}

function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function changeHint(current: number, previous: number, against: string): string | null {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs ${against}`;
}

function costsOf(m: FinanceMonth): number {
  return m.laborCents + m.materialCents + m.overheadCents;
}

type Row = { key: string; title: string; month: FinanceMonth; partial: boolean };

const cardCls = "rounded-xl border border-gray-100 bg-white p-5 shadow-sm";
const cardTitleCls = "text-sm font-semibold text-gray-900";

const REVENUE_COLOR = "#2a78d6";
const COST_COLOR = "#c7ccd4";
const CHANGE_ORDER_COLOR = "#eb6834";

/** A quiet two or three option switch that links to the same tab. `children`
 * go in the same pill after the options (the Custom dates button). */
function Segmented({ options, active, children }: { options: { key: string; label: string; href: string }[]; active: string; children?: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={o.key === active ? "page" : undefined}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            o.key === active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {o.label}
        </Link>
      ))}
      {children}
    </div>
  );
}

/** One of the three headline numbers. */
function Headline({ label, cents, sub, title, negative }: { label: string; cents: number; sub: string | null; title: string; negative?: boolean }) {
  return (
    <div className="min-w-0 flex-1 basis-40 px-5 py-4" title={title}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${negative ? "text-red-600" : "text-gray-900"}`}>{short(cents)}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/** Finished work by billing status, closest to cash first (one blue, lighter
 * the further from paid), with sold-but-not-finished work beside it. */
function BillingCard({ parts, future }: { parts: { label: string; cents: number; color: string; hint: string }[]; future: FutureJob[] }) {
  const futureCents = future.reduce((s, j) => s + j.valueCents, 0);
  const review = future.filter((j) => j.reviewReason);
  const reviewCents = review.reduce((s, j) => s + j.valueCents, 0);
  const whole = parts.reduce((s, p) => s + p.cents, 0);
  return (
    <div className={`${cardCls} flex flex-wrap items-stretch gap-x-8 gap-y-4`}>
      <div className="min-w-0 flex-[3_1_20rem]">
        <h3 className={cardTitleCls}>Billed vs paid</h3>
        {whole === 0 ? (
          <p className="pt-3 text-sm text-gray-400">No finished work in these dates.</p>
        ) : (
          <>
            <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${money(p.cents)}`).join(", ")}>
              {parts.filter((p) => p.cents > 0).map((p) => (
                <div key={p.label} className="h-full" style={{ width: `${(p.cents / whole) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${money(p.cents)}`} />
              ))}
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              {parts.map((p) => (
                <div key={p.label} title={`${p.hint}: ${money(p.cents)}`}>
                  <dt className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{short(p.cents)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
      <div
        className="flex-[1_1_9rem] border-gray-100 sm:border-l sm:pl-8"
        title={`Sold, not finished: ${future.length} active, upcoming, or on hold project${future.length === 1 ? "" : "s"}, ${money(futureCents)}` + (review.length ? `\n${review.length} of them (${money(reviewCents)}) look finished or stale: see Needs review in Future revenue below` : "")}
      >
        <p className="text-xs text-gray-500">Future</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{short(futureCents)}</p>
        <p className="mt-0.5 text-xs text-gray-400">sold, not finished</p>
        {reviewCents > 0 && (
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-amber-700">{short(reviewCents)} needs review</p>
            <details className="relative">
              <summary
                className="flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-amber-50 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                title="See which projects need review"
              >
                !
              </summary>
              <div className="absolute right-0 z-10 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg">
                <p className="font-medium text-gray-900">May be finished or stale</p>
                <p className="mt-0.5 text-gray-500">Update each project&apos;s status or dates to fix Future.</p>
                <ul className="mt-2 space-y-0.5">
                  {[...review].sort((a, b) => b.valueCents - a.valueCents).map((j) => (
                    <li key={j.id}>
                      <Link href={`/erp/projects/${j.id}`} className="flex items-baseline justify-between gap-3 rounded px-1.5 py-1 hover:bg-gray-50">
                        <span className="min-w-0">
                          <span className="block truncate text-gray-800" title={j.title}>{j.title}</span>
                          <span className="block text-gray-400">{j.reviewReason}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-900" title={money(j.valueCents)}>{short(j.valueCents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

/** Revenue and costs side by side per month (or year), oldest first, with
 * net profit under each. Exact numbers on hover and in the table below. */
/** Commission earned and paid in the dates, and owed right now, by person. */
function CommissionCard({ earned, paid, owedAll, periodLabel }: { earned: CommissionItem[]; paid: CommissionItem[]; owedAll: CommissionItem[]; periodLabel: string }) {
  type Person = { key: string; name: string; unassigned: boolean; earned: number; paid: number; owed: number };
  const people = new Map<string, Person>();
  const personOf = (item: CommissionItem) => {
    const key = item.personId ?? "unassigned";
    let p = people.get(key);
    if (!p) {
      p = { key, name: item.personName ?? "No salesperson set", unassigned: !item.personId, earned: 0, paid: 0, owed: 0 };
      people.set(key, p);
    }
    return p;
  };
  for (const i of earned) personOf(i).earned += i.cents;
  for (const i of paid) personOf(i).paid += i.cents;
  for (const i of owedAll) personOf(i).owed += i.cents;
  const rows = [...people.values()].sort((a, b) => b.owed - a.owed || b.earned - a.earned);
  const sum = (list: CommissionItem[]) => list.reduce((s, i) => s + i.cents, 0);
  const totals = [
    { label: "Earned", cents: sum(earned), hint: `Commission that became due in ${periodLabel}: a deal once it and its change orders are paid, a janitorial month once it's paid, a bid bonus for its week` },
    { label: "Paid", cents: sum(paid), hint: `Commission and bid bonuses marked paid in ${periodLabel} (the Commission line in Where the money went)` },
    { label: "Owed now", cents: sum(owedAll), hint: "Earned but not marked paid yet, from any date" },
  ];
  const cell = "py-2 text-right tabular-nums";

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={cardTitleCls}>Commission</h3>
        <Link href="/erp/payroll?view=Commission" className="text-xs text-gray-500 hover:text-gray-900">Open Commission →</Link>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
        {totals.map((t) => (
          <div key={t.label} title={`${t.hint}: ${money(t.cents)}`}>
            <dt className="text-xs text-gray-500">{t.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{short(t.cents)}</dd>
          </div>
        ))}
      </dl>
      {rows.length === 0 ? (
        <p className="pt-3 text-sm text-gray-400">No commission earned or owed yet.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="py-1.5 text-left font-medium">Person</th>
              <th className="py-1.5 text-right font-medium">Earned</th>
              <th className="py-1.5 text-right font-medium">Paid</th>
              <th className="py-1.5 text-right font-medium">Owed now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className={`py-2 ${r.unassigned ? "text-amber-700" : "text-gray-700"}`} title={r.unassigned ? "Deals or janitorial contracts with no salesperson assigned. Set one on the project or contract so this commission goes to someone." : undefined}>
                  {r.name}
                </td>
                <td className={`${cell} text-gray-900`} title={money(r.earned)}>{short(r.earned)}</td>
                <td className={`${cell} text-gray-500`} title={money(r.paid)}>{short(r.paid)}</td>
                <td className={`${cell} text-gray-900`} title={money(r.owed)}>{short(r.owed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TrendCard({ rows, isAll }: { rows: Row[]; isAll: boolean }) {
  const chrono = [...rows].reverse();
  const max = Math.max(1, ...chrono.map((r) => Math.max(r.month.revenueCents, costsOf(r.month))));
  const thCls = "py-2 text-right text-xs font-medium text-gray-400";
  const tdCls = "py-2 text-right tabular-nums";
  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={cardTitleCls}>{isAll ? "By year" : "By month"}</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: REVENUE_COLOR }} />Revenue</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: COST_COLOR }} />Costs</span>
        </div>
      </div>
      {chrono.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nothing in these dates.</p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-2 border-b border-gray-200" style={{ height: 150 }}>
            {chrono.map((r) => {
              const costs = costsOf(r.month);
              return (
                <div
                  key={r.key}
                  className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
                  title={`${r.title}${r.partial ? " (so far)" : ""}\nRevenue ${money(r.month.revenueCents)}\nCosts ${money(costs)}\nNet profit ${money(r.month.netProfitCents)}`}
                >
                  <div className="w-full max-w-5 rounded-t" style={{ height: `${(r.month.revenueCents / max) * 100}%`, backgroundColor: REVENUE_COLOR }} />
                  <div className="w-full max-w-5 rounded-t" style={{ height: `${(costs / max) * 100}%`, backgroundColor: COST_COLOR }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            {chrono.map((r) => (
              <div key={r.key} className="min-w-0 flex-1 text-center">
                <p className="truncate text-xs text-gray-600">{isAll ? r.title : monthName(r.key)}{r.partial ? "*" : ""}</p>
                <p className={`text-xs tabular-nums ${r.month.netProfitCents < 0 ? "text-red-600" : "text-gray-400"}`} title="Net profit">
                  {short(r.month.netProfitCents)}
                </p>
              </div>
            ))}
          </div>
          <details className="group mt-4">
            <summary className="cursor-pointer list-none text-xs text-gray-500 hover:text-gray-800">
              <span className="group-open:hidden">Show table</span>
              <span className="hidden group-open:inline">Hide table</span>
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr>
                  <th className={`${thCls} text-left`}>{isAll ? "Year" : "Month"}</th>
                  <th className={thCls}>Revenue</th>
                  <th className={thCls}>Costs</th>
                  <th className={thCls}>Net profit</th>
                  <th className={thCls}>Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 text-left text-gray-700">{r.title}{r.partial && <span className="ml-1.5 text-xs text-gray-400">so far</span>}</td>
                    <td className={`${tdCls} text-gray-900`}>{money(r.month.revenueCents)}</td>
                    <td className={`${tdCls} text-gray-500`}>{money(costsOf(r.month))}</td>
                    <td className={`${tdCls} ${r.month.netProfitCents < 0 ? "text-red-600" : "text-gray-900"}`}>{money(r.month.netProfitCents)}</td>
                    <td className={`${tdCls} text-gray-400`}>{pctLabel(pct(r.month.netProfitCents, r.month.revenueCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {chrono.some((r) => r.partial) && <p className="mt-2 text-xs text-gray-400">* so far</p>}
        </>
      )}
    </div>
  );
}

/** Most profitable / lowest margin rows: the emphasized number first. */
function jobRows(jobs: FinanceJob[], emphasis: "profit" | "margin"): JobTabRow[] {
  return jobs.map((j) => {
    const margin = pct(j.profitCents, j.revenueCents);
    const detail = `Revenue ${money(j.revenueCents)}, cost ${money(j.costCents)}, profit ${money(j.profitCents)}`;
    return emphasis === "profit"
      ? { id: j.id, href: j.href, title: j.title, value: short(j.profitCents), valueTitle: detail, negative: j.profitCents < 0, secondary: pctLabel(margin) }
      : { id: j.id, href: j.href, title: j.title, value: pctLabel(margin), valueTitle: detail, negative: margin != null && margin < 0, secondary: short(j.profitCents) };
  });
}

const FUTURE_STATUS_LABELS: Record<FutureJob["status"], string> = { ACTIVE: "In progress", UPCOMING: "Upcoming", ON_HOLD: "On hold" };

/** Future projects, the ones that look finished or stale last under "Needs review". */
function futureRows(jobs: FutureJob[], todayKey: string): JobTabRow[] {
  const ordered = [...jobs.filter((j) => !j.reviewReason), ...jobs.filter((j) => j.reviewReason)];
  const reviewCount = jobs.filter((j) => j.reviewReason).length;
  const reviewCents = jobs.reduce((s, j) => s + (j.reviewReason ? j.valueCents : 0), 0);
  return ordered.map((j) => {
    const start = j.startKey
      ? new Date(`${j.startKey}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : null;
    const when = start ? `${j.startKey! > todayKey ? "starts" : "started"} ${start}` : null;
    return {
      id: j.id, href: `/erp/projects/${j.id}`, title: j.title,
      group: j.reviewReason ? `Needs review: ${reviewCount} project${reviewCount === 1 ? "" : "s"}, ${short(reviewCents)} (may be finished or stale)` : undefined,
      note: [FUTURE_STATUS_LABELS[j.status], when, j.changeOrderCents > 0 && `incl. ${short(j.changeOrderCents)} change orders`, j.reviewReason].filter(Boolean).join(", "),
      value: short(j.valueCents),
      valueTitle: j.changeOrderCents > 0
        ? `Contract ${money(j.valueCents - j.changeOrderCents)}, change orders not done yet ${money(j.changeOrderCents)}`
        : money(j.valueCents),
    };
  });
}

export async function FinanceTab({ period, by }: { period: string | undefined; by: string | undefined }) {
  const anchor: FinanceAnchor = by === "paid" ? "paid" : "completed";
  // A single month ("YYYY-MM") can be any month, even before the data start;
  // the month before it is computed too, for the comparison.
  const pickedMonth = period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : null;
  // A custom date range: "YYYY-MM-DD..YYYY-MM-DD" (either order).
  const rangeMatch = period?.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  const range = rangeMatch
    ? rangeMatch[1] <= rangeMatch[2] ? { from: rangeMatch[1], to: rangeMatch[2] } : { from: rangeMatch[2], to: rangeMatch[1] }
    : null;
  const startKey = pickedMonth && prevMonthKey(pickedMonth) < FINANCE_DATA_START ? prevMonthKey(pickedMonth) : FINANCE_DATA_START;
  const summary = await computeFinanceSummary(anchor, range ? { range } : { startKey });
  const { currentMonthKey } = summary;
  const currentYear = currentMonthKey.slice(0, 4);
  const month = pickedMonth && pickedMonth <= currentMonthKey ? pickedMonth : null;
  // Year and "All years" views always start at the data start.
  const months = summary.months.filter((m) => m.key >= FINANCE_DATA_START);

  const years: string[] = [];
  for (let y = Number(currentYear); y >= Number(FINANCE_DATA_START.slice(0, 4)); y--) years.push(String(y));
  const selected = range ? period! : month ?? (period === "all" || (period && years.includes(period)) ? period : currentYear);
  const isAll = selected === "all";
  const isMonth = month != null;
  const isRange = range != null;
  const isSingle = isMonth || isRange;

  // Rows: months of the selected year, or one row per year for "All years",
  // newest first, or just the picked month or date range.
  const rows: Row[] = isRange
    ? summary.months.map((m) => ({ key: m.key, title: rangeLabel(range), month: m, partial: range.to >= summary.todayKey }))
    : isMonth
    ? summary.months.filter((m) => m.key === month).map((m) => ({ key: m.key, title: monthName(m.key, "long"), month: m, partial: m.key === currentMonthKey }))
    : isAll
    ? years.map((y) => ({
        key: y, title: y,
        month: sumMonths(y, months.filter((m) => m.key.startsWith(y))),
        partial: y === currentYear,
      }))
    : months.filter((m) => m.key.startsWith(selected)).map((m) => ({
        key: m.key, title: monthName(m.key, "long"),
        month: m, partial: m.key === currentMonthKey,
      })).reverse();
  const total = sumMonths("total", rows.map((r) => r.month));

  // A month compares against the month before; a year against the same
  // months of the prior year, so a year in progress compares like for like.
  let comparison: FinanceMonth | null = null;
  let comparisonLabel = "";
  if (isMonth) {
    comparison = summary.months.find((m) => m.key === prevMonthKey(month)) ?? null;
    comparisonLabel = monthName(prevMonthKey(month));
  } else if (!isAll && !isRange) {
    const priorYear = String(Number(selected) - 1);
    const monthSuffixes = new Set(rows.map((r) => r.key.slice(5)));
    const prior = months.filter((m) => m.key.startsWith(priorYear) && monthSuffixes.has(m.key.slice(5)));
    if (prior.length > 0) {
      comparison = sumMonths(priorYear, prior);
      comparisonLabel = selected === currentYear ? `same months ${priorYear}` : priorYear;
    }
  }

  // A range's summary only holds jobs inside it.
  const periodJobs = isRange ? summary.jobs : summary.jobs.filter((j) => (isAll ? j.monthKey >= FINANCE_DATA_START : j.monthKey.startsWith(selected)));
  const mostProfitable = [...periodJobs].sort((a, b) => b.profitCents - a.profitCents);
  const lowestMargin = [...periodJobs]
    .filter((j) => j.revenueCents > 0)
    .sort((a, b) => a.profitCents / a.revenueCents - b.profitCents / b.revenueCents);

  // The three main lines of work always show (even at $0); Other only when it has something.
  const segments = FINANCE_SEGMENTS.filter((s) => s !== "OTHER" || total.segments[s].jobs > 0);

  const { warnings } = summary;
  // Each gap names what's missing and links to where it's fixed.
  const gapGroups: { title: string; items: GapItem[] }[] = [
    { title: "Complete, no end date (left out)", items: warnings.noCompletionDate },
    { title: "Complete, no contract value (left out)", items: warnings.noContractValue },
    { title: "Salaried, no salary on file (counted as $0)", items: warnings.salaryMissing },
    {
      title: "Janitors with no hourly rate (hours cost $0)",
      items: warnings.janitorMissingRate.map((name) => ({ id: name, label: name, href: "/erp/employees" })),
    },
  ].filter((g) => g.items.length > 0);
  const gapCount = gapGroups.reduce((s, g) => s + g.items.length, 0);

  const href = (p: string, a: FinanceAnchor) => `/erp?tab=finance&period=${p}${a === "paid" ? "&by=paid" : ""}`;
  const isPaidView = anchor === "paid";
  const periodLabel = isRange ? rangeLabel(range) : isMonth ? `${monthName(month, "long")} ${month.slice(0, 4)}` : isAll ? "all years" : selected;

  const jobCosts = total.laborCents + total.materialCents;
  const totalCosts = jobCosts + total.overheadCents;
  const billingParts = [
    { label: "Paid", cents: total.paidCents, color: "#1c5cab", hint: "Finished and marked paid" },
    { label: "Billed, waiting", cents: total.billedCents, color: "#4a90e2", hint: "Finished and invoiced, not paid yet" },
    { label: "Done, not billed", cents: total.notBilledCents, color: "#a9cdf5", hint: "Finished, not invoiced yet" },
  ];
  const costs = costBreakdown(total).filter((c) => c.cents !== 0);

  /** Whether a day ("YYYY-MM-DD") is inside the dates being viewed. */
  const dataStartDay = `${FINANCE_DATA_START}-01`;
  const inView = (dayKey: string): boolean =>
    isRange ? dayKey >= range.from && dayKey <= range.to
    : isMonth ? dayKey.startsWith(month)
    : isAll ? dayKey >= dataStartDay && dayKey <= summary.todayKey
    : dayKey.startsWith(selected) && dayKey >= dataStartDay && dayKey <= summary.todayKey;

  return (
    <div className="space-y-4">
      {/* Controls: dates on the left, counting and help on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          active={selected}
          options={
            years.length < 2
              ? [{ key: currentYear, label: `Since ${monthName(FINANCE_DATA_START)} ${FINANCE_DATA_START.slice(0, 4)}`, href: href(currentYear, anchor) }]
              : [...years, "all"].map((y) => ({ key: y, label: y === "all" ? "All years" : y, href: href(y, anchor) }))
          }
        >
          <FinanceDateRange range={range} label={range ? rangeLabel(range) : null} today={summary.todayKey} byPaid={isPaidView} />
        </Segmented>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Count by</span>
          <Segmented
            active={anchor}
            options={[
              { key: "completed", label: "Completed", href: href(selected, "completed") },
              { key: "paid", label: "Paid", href: href(selected, "paid") },
            ]}
          />
          {gapCount > 0 && (
            <details className="relative">
              <summary
                className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                title={`${gapCount} data gap${gapCount === 1 ? "" : "s"} affect these numbers`}
              >
                !
              </summary>
              <div className="absolute right-0 z-10 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg">
                <p className="font-medium text-gray-900">Data gaps affecting these numbers</p>
                {gapGroups.map((g) => (
                  <div key={g.title} className="mt-3">
                    <p className="text-gray-500">{g.title}</p>
                    <ul className="mt-1 space-y-0.5">
                      {g.items.map((item) => (
                        <li key={item.id}>
                          <Link href={item.href} className="block truncate rounded px-1.5 py-1 text-gray-800 hover:bg-gray-50" title={item.label}>{item.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
          <Link
            href={HELP_HREF}
            title="How each number is calculated"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          >
            ?
          </Link>
        </div>
      </div>

      {((isMonth && month < FINANCE_DATA_START) || (isRange && range.from < `${FINANCE_DATA_START}-01`)) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The ERP wasn&apos;t fully in use before {monthName(FINANCE_DATA_START, "long")} {FINANCE_DATA_START.slice(0, 4)}, so {periodLabel} is missing jobs and costs. Use it as a rough guide only.
        </p>
      )}

      {/* Headline: revenue, costs, net profit */}
      <div className="flex flex-wrap divide-gray-100 rounded-xl border border-gray-100 bg-white shadow-sm max-sm:divide-y sm:divide-x">
        <Headline
          label="Revenue"
          cents={total.revenueCents}
          sub={(comparison && changeHint(total.revenueCents, comparison.revenueCents, comparisonLabel)) || (isPaidView ? "paid work" : "finished work")}
          title={`${money(total.revenueCents)}, ${isPaidView ? "counted when marked paid" : "counted when the work was finished"}`}
        />
        <Headline
          label="Costs"
          cents={totalCosts}
          sub={`${short(jobCosts)} jobs, ${short(total.overheadCents)} overhead`}
          title={`${money(totalCosts)}\nJob costs ${money(jobCosts)} (gross profit ${money(total.grossProfitCents)}, ${pctLabel(pct(total.grossProfitCents, total.revenueCents))})\nOverhead ${money(total.overheadCents)}`}
        />
        <Headline
          label={isPaidView ? "Net profit (paid work only)" : "Net profit"}
          cents={total.netProfitCents}
          sub={`${pctLabel(pct(total.netProfitCents, total.revenueCents))} margin`}
          title={isPaidView
            ? `${money(total.netProfitCents)}: paid revenue minus all costs. Overhead counts in full while unpaid work doesn't count yet, so this runs low until customers pay.`
            : `${money(total.netProfitCents)}, revenue minus costs`}
          negative={total.netProfitCents < 0}
        />
      </div>
      {isPaidView && (
        <p className="-mt-2 px-1 text-xs text-gray-400">
          Paid view: revenue only counts work that&apos;s been paid, but salaries and other overhead count in full, so net profit runs low until customers pay.
          Use Completed for how profitable the work is.
        </p>
      )}

      <BillingCard parts={billingParts} future={summary.futureJobs} />

      {/* Revenue by category + where the money went */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={cardTitleCls}>Revenue by category</h3>
            {segments.some((s) => total.segments[s].changeOrderCents > 0) && (
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: REVENUE_COLOR }} />Contract</span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: CHANGE_ORDER_COLOR }} />Change orders</span>
              </div>
            )}
          </div>
          <ul className="mt-4 space-y-4">
            {segments.map((s) => {
              const seg = total.segments[s];
              const profit = seg.revenueCents - seg.costCents;
              const unit = s === "JANITORIAL_CONTRACTS" ? "contract month" : "job";
              const contractCents = seg.revenueCents - seg.changeOrderCents;
              const share = total.revenueCents > 0 ? (seg.revenueCents / total.revenueCents) * 100 : 0;
              return (
                <li
                  key={s}
                  title={[
                    `${money(seg.revenueCents)} from ${seg.jobs} ${unit}${seg.jobs === 1 ? "" : "s"}`,
                    seg.changeOrderCents > 0 && `Contract ${money(contractCents)}, change orders ${money(seg.changeOrderCents)}`,
                    `Job costs ${money(seg.costCents)}, profit ${money(profit)} (${pctLabel(pct(profit, seg.revenueCents))} margin)`,
                  ].filter(Boolean).join("\n")}
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-gray-700">{FINANCE_SEGMENT_LABELS[s]}</span>
                    <span className="font-semibold tabular-nums text-gray-900">{short(seg.revenueCents)}</span>
                  </div>
                  {/* Contract, then change orders, inside this category's share of revenue. */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                    <div className="flex h-full gap-0.5" style={{ width: `${share}%` }}>
                      {contractCents > 0 && <div className="h-full rounded-full" style={{ flexGrow: contractCents, backgroundColor: REVENUE_COLOR }} />}
                      {seg.changeOrderCents > 0 && <div className="h-full rounded-full" style={{ flexGrow: seg.changeOrderCents, backgroundColor: CHANGE_ORDER_COLOR }} />}
                    </div>
                  </div>
                  {seg.changeOrderCents > 0 && (
                    <p className="mt-1 text-xs tabular-nums text-gray-400">
                      {short(contractCents)} contract, {short(seg.changeOrderCents)} change orders
                    </p>
                  )}
                  {s === "JANITORIAL_CONTRACTS" && summary.activeContracts > 0 && (
                    <p
                      className="mt-1 text-xs tabular-nums text-gray-400"
                      title={`${money(summary.recurringMonthlyCents)} a month, ${money(summary.recurringMonthlyCents * 12)} a year`}
                    >
                      {summary.activeContracts} active contract{summary.activeContracts === 1 ? "" : "s"}, {short(summary.recurringMonthlyCents)} a month
                      {summary.nextContractStartKey && seg.revenueCents === 0 && `, starting ${new Date(`${summary.nextContractStartKey}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={cardCls}>
          <h3 className={cardTitleCls}>Where the money went</h3>
          {costs.length === 0 ? (
            <p className="pt-3 text-sm text-gray-400">No costs in {periodLabel}.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-50 text-sm">
              {costs.map((c) => (
                <li key={c.label} className="flex justify-between gap-3 py-2" title={`${c.hint}: ${money(c.cents)} (${pctLabel(pct(c.cents, total.revenueCents))} of revenue)`}>
                  <span className="text-gray-700">{c.label}</span>
                  <span className="tabular-nums text-gray-900">{short(c.cents)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 pt-2.5 font-semibold text-gray-900" title={money(totalCosts)}>
                <span>Total</span>
                <span className="tabular-nums">{short(totalCosts)}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      <CommissionCard
        earned={summary.commission.earned.filter((i) => inView(i.dayKey))}
        paid={summary.commission.paid.filter((i) => inView(i.dayKey))}
        owedAll={summary.commission.earned.filter((i) => !i.paid)}
        periodLabel={periodLabel}
      />

      {!isSingle && <TrendCard rows={rows} isAll={isAll} />}

      {/* Jobs: best, worst, and still to come */}
      <JobTabs
        tabs={[
          { key: "profit", label: "Most profitable", rows: jobRows(mostProfitable, "profit"), limit: 5, empty: `No ${isPaidView ? "paid" : "finished"} jobs in ${periodLabel}.` },
          { key: "margin", label: "Lowest margin", rows: jobRows(lowestMargin, "margin"), limit: 5, empty: `No ${isPaidView ? "paid" : "finished"} jobs in ${periodLabel}.` },
          {
            key: "future", label: "Future revenue", rows: futureRows(summary.futureJobs, summary.todayKey), empty: "No active or upcoming projects.",
            footer: `${summary.backlogJobs} project${summary.backlogJobs === 1 ? "" : "s"}, ${money(summary.backlogCents)}`,
          },
        ]}
      />
    </div>
  );
}
