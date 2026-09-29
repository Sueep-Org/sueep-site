import Link from "next/link";
import {
  computeFinanceSummary,
  sumMonths,
  FINANCE_SEGMENTS,
  FINANCE_SEGMENT_LABELS,
  FINANCE_DATA_START,
  type FinanceMonth,
  type FinanceJob,
} from "@/lib/erp/financeSummary";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function pctLabel(p: number | null): string {
  return p == null ? "-" : `${p}%`;
}

/** Red only when something is actually wrong (a loss), gray otherwise. */
function tone(cents: number): string {
  return cents < 0 ? "text-red-600" : "text-gray-900";
}

function monthName(key: string, month: "short" | "long" = "short"): string {
  return new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("en-US", { month, timeZone: "UTC" });
}

function changeHint(current: number, previous: number, against: string): string | null {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs ${against}`;
}

function overheadTitle(m: FinanceMonth): string {
  return [
    `Salaries (not already in job costs): ${money(m.salaryCents)}`,
    `Offshore pay: ${money(m.offshoreCents)}`,
    `Commission paid: ${money(m.commissionCents)}`,
    `Reimbursements: ${money(m.reimbursementCents)}`,
  ].join("\n");
}

function costsTitle(m: FinanceMonth): string {
  return `Labor and contractors: ${money(m.laborCents)}\nMaterials: ${money(m.materialCents)}`;
}

type Row = { key: string; title: string; month: FinanceMonth; partial: boolean };

const cardCls = "rounded-xl border border-gray-100 bg-white shadow-sm";
const cardTitleCls = "text-sm font-semibold text-gray-900";

/** One step of the money flow card (Revenue - Job costs = Gross profit ...). */
function FlowStep({ label, value, valueTone, sub, title, last }: { label: string; value: string; valueTone?: string; sub: string; title?: string; last?: boolean }) {
  return (
    <div
      className={`min-w-0 flex-1 basis-36 px-4 py-3.5 ${last ? "bg-gray-50 max-sm:rounded-b-xl sm:rounded-r-xl" : ""}`}
      title={title}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-[17px] font-semibold tabular-nums ${valueTone ?? "text-gray-900"}`}>{value}</p>
      <p className="truncate text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function FlowOp({ children }: { children: string }) {
  return <span aria-hidden className="hidden items-center px-0.5 text-base text-gray-300 sm:flex">{children}</span>;
}

/** One inline "Label $value note" item in the line under the flow card. */
function Stat({ label, value, valueTone, note, title }: { label: string; value: string; valueTone?: string; note?: string | null; title?: string }) {
  return (
    <span className="whitespace-nowrap" title={title}>
      <span className="text-gray-500">{label} </span>
      <span className={`font-semibold tabular-nums ${valueTone ?? "text-gray-900"}`}>{value}</span>
      {note && <span className="ml-1 text-xs text-gray-400">{note}</span>}
    </span>
  );
}

function JobList({ title, jobs, emphasis }: { title: string; jobs: FinanceJob[]; emphasis: "profit" | "margin" }) {
  return (
    <div className={`${cardCls} p-4`}>
      <h3 className={cardTitleCls}>{title}</h3>
      {jobs.length === 0 ? (
        <p className="py-4 text-sm text-gray-400">No completed jobs in this period.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {jobs.map((j) => {
            const margin = pct(j.profitCents, j.revenueCents);
            return (
              <li key={j.id}>
                <Link href={j.href} className="-mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition hover:bg-gray-50">
                  <span className="min-w-0 truncate text-sm text-gray-700" title={j.title}>{j.title}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {emphasis === "profit" ? (
                      <><span className={tone(j.profitCents)}>{money(j.profitCents)}</span> <span className="text-xs text-gray-400">{pctLabel(margin)}</span></>
                    ) : (
                      <><span className={margin != null && margin < 0 ? "text-red-600" : "text-gray-900"}>{pctLabel(margin)}</span> <span className="text-xs text-gray-400">{money(j.profitCents)}</span></>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export async function FinanceTab({ period }: { period: string | undefined }) {
  const summary = await computeFinanceSummary();
  const { months, currentMonthKey } = summary;
  const currentYear = currentMonthKey.slice(0, 4);

  const years = Array.from(new Set(months.map((m) => m.key.slice(0, 4)))).sort().reverse();
  const selected = period === "all" || (period && years.includes(period)) ? period : currentYear;
  const isAll = selected === "all";

  // Rows: months of the selected year, or one row per year for "All years",
  // newest first.
  const rows: Row[] = isAll
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

  // Same months of the prior year, so a year in progress compares like for like.
  let comparison: FinanceMonth | null = null;
  let comparisonLabel = "";
  if (!isAll) {
    const priorYear = String(Number(selected) - 1);
    const monthSuffixes = new Set(rows.map((r) => r.key.slice(5)));
    const prior = months.filter((m) => m.key.startsWith(priorYear) && monthSuffixes.has(m.key.slice(5)));
    if (prior.length > 0) {
      comparison = sumMonths(priorYear, prior);
      comparisonLabel = selected === currentYear ? `same months ${priorYear}` : priorYear;
    }
  }

  const periodJobs = summary.jobs.filter((j) => isAll || j.monthKey.startsWith(selected));
  const mostProfitable = [...periodJobs].sort((a, b) => b.profitCents - a.profitCents).slice(0, 5);
  const lowestMargin = [...periodJobs]
    .filter((j) => j.revenueCents > 0)
    .sort((a, b) => a.profitCents / a.revenueCents - b.profitCents / b.revenueCents)
    .slice(0, 5);

  const thisMonth = months.find((m) => m.key === currentMonthKey);
  const lastMonth = months[months.length - 2];
  const segments = FINANCE_SEGMENTS.filter((s) => total.segments[s].jobs > 0);

  const { warnings } = summary;
  const warningLines = [
    warnings.noContractValue > 0 && `${warnings.noContractValue} completed job${warnings.noContractValue === 1 ? " has" : "s have"} no contract value, so ${warnings.noContractValue === 1 ? "it's" : "they're"} left out.`,
    warnings.noCompletionDate > 0 && `${warnings.noCompletionDate} completed job${warnings.noCompletionDate === 1 ? " has" : "s have"} no end date, so ${warnings.noCompletionDate === 1 ? "it" : "they"} can't be placed in a month.`,
    warnings.salaryMissing > 0 && `${warnings.salaryMissing} salaried employee${warnings.salaryMissing === 1 ? " has" : "s have"} no salary on file (counted as $0).`,
    warnings.janitorMissingRate.length > 0 && `No hourly rate for ${warnings.janitorMissingRate.join(", ")}, so their janitorial hours cost $0.`,
  ].filter((l): l is string => !!l);

  const thCls = "px-4 py-2 text-right text-xs font-medium text-gray-400";
  const tdCls = "px-4 py-2.5 text-right tabular-nums";

  // Money cell with its margin as quiet secondary text.
  const withMargin = (cents: number, revenue: number) => (
    <>
      <span className={tone(cents)}>{money(cents)}</span>
      <span className="ml-1.5 inline-block w-9 text-xs text-gray-400">{pctLabel(pct(cents, revenue))}</span>
    </>
  );

  return (
    <div className="space-y-5">
      {/* Period picker: one quiet segmented control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {years.length < 2 ? (
          <p className="text-xs text-gray-400">Since {monthName(FINANCE_DATA_START, "long")} {FINANCE_DATA_START.slice(0, 4)}</p>
        ) : (
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          {[...years, "all"].map((y) => (
            <Link
              key={y}
              href={`/erp?tab=finance&period=${y}`}
              aria-current={y === selected ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                y === selected ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {y === "all" ? "All years" : y}
            </Link>
          ))}
        </div>
        )}
        {warningLines.length > 0 && (
          <details className="group relative text-xs">
            <summary className="cursor-pointer list-none text-amber-700 hover:underline">
              {warningLines.length} data gap{warningLines.length === 1 ? "" : "s"} affect these numbers
            </summary>
            <ul className="absolute right-0 z-10 mt-1 w-80 list-disc space-y-1 rounded-lg border border-gray-200 bg-white py-2 pl-7 pr-3 text-gray-600 shadow-lg">
              {warningLines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </details>
        )}
      </div>

      {/* Money flow: Revenue - Job costs = Gross profit - Overhead = Net profit */}
      <div className={`${cardCls} flex flex-wrap max-sm:divide-y max-sm:divide-gray-100`}>
        <FlowStep
          label="Revenue"
          value={money(total.revenueCents)}
          sub={(comparison && changeHint(total.revenueCents, comparison.revenueCents, comparisonLabel)) || "completed work"}
          title="Completed work, counted in the month it was finished"
        />
        <FlowOp>−</FlowOp>
        <FlowStep label="Job costs" value={money(total.laborCents + total.materialCents)} sub="labor, subs, materials" title={costsTitle(total)} />
        <FlowOp>=</FlowOp>
        <FlowStep
          label="Gross profit"
          value={money(total.grossProfitCents)}
          valueTone={tone(total.grossProfitCents)}
          sub={`${pctLabel(pct(total.grossProfitCents, total.revenueCents))} margin`}
          title="Revenue minus job costs"
        />
        <FlowOp>−</FlowOp>
        <FlowStep label="Overhead" value={money(total.overheadCents)} sub="salaries, offshore, other" title={overheadTitle(total)} />
        <FlowOp>=</FlowOp>
        <FlowStep
          label="Net profit"
          value={money(total.netProfitCents)}
          valueTone={tone(total.netProfitCents)}
          sub={`${pctLabel(pct(total.netProfitCents, total.revenueCents))} margin`}
          title="Gross profit minus overhead"
          last
        />
      </div>

      {/* Context line */}
      <div className="text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs">
          <Stat
            label="Awaiting payment"
            value={money(total.unpaidCents)}
            title="Earned in this period but not marked paid on the Billing page yet"
          />
          <Stat
            label={`${monthName(currentMonthKey, "long")} so far`}
            value={money(thisMonth?.revenueCents ?? 0)}
            note={lastMonth ? changeHint(thisMonth?.revenueCents ?? 0, lastMonth.revenueCents, monthName(lastMonth.key)) : null}
            title="Revenue in the month in progress"
          />
          <Stat
            label="Backlog"
            value={money(summary.backlogCents)}
            note={`${summary.backlogJobs} job${summary.backlogJobs === 1 ? "" : "s"}`}
            title="Contract value of active, upcoming, and on-hold projects (not earned yet)"
          />
          <Stat
            label="Janitorial contracts"
            value={`${money(summary.recurringMonthlyCents)}/mo`}
            title={`${summary.activeContracts} active janitorial contract${summary.activeContracts === 1 ? "" : "s"}, ${money(summary.recurringMonthlyCents * 12)} per year`}
          />
        </div>
      </div>

      {/* Month (or year) breakdown, newest first */}
      <div className={cardCls}>
        <div className="px-4 pt-4 pb-2">
          <h3 className={cardTitleCls}>{isAll ? "By year" : "By month"}</h3>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-center text-sm text-gray-400">No completed work in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={`${thCls} text-left`}>{isAll ? "Year" : "Month"}</th>
                  <th className={thCls}>Revenue</th>
                  <th className={thCls} title="Labor, contractors, and materials">Job costs</th>
                  <th className={thCls}>Gross profit</th>
                  <th className={thCls} title="Salaries not already in job costs, offshore pay, commission paid, reimbursements">Overhead</th>
                  <th className={thCls}>Net profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const m = r.month;
                  return (
                    <tr key={r.key} className="hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-left text-gray-700">
                        {r.title}
                        {r.partial && <span className="ml-1.5 text-xs text-gray-400">so far</span>}
                      </td>
                      <td className={`${tdCls} text-gray-900`}>{money(m.revenueCents)}</td>
                      <td className={`${tdCls} text-gray-500`} title={costsTitle(m)}>{money(m.laborCents + m.materialCents)}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{withMargin(m.grossProfitCents, m.revenueCents)}</td>
                      <td className={`${tdCls} text-gray-500`} title={overheadTitle(m)}>{money(m.overheadCents)}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{withMargin(m.netProfitCents, m.revenueCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="border-t border-gray-200 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5 text-left text-gray-900">Total</td>
                    <td className={`${tdCls} text-gray-900`}>{money(total.revenueCents)}</td>
                    <td className={`${tdCls} text-gray-500`} title={costsTitle(total)}>{money(total.laborCents + total.materialCents)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{withMargin(total.grossProfitCents, total.revenueCents)}</td>
                    <td className={`${tdCls} text-gray-500`} title={overheadTitle(total)}>{money(total.overheadCents)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{withMargin(total.netProfitCents, total.revenueCents)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Type of work + jobs */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={`${cardCls} p-4`}>
          <h3 className={cardTitleCls}>By type of work</h3>
          {segments.length === 0 ? (
            <p className="py-4 text-sm text-gray-400">No completed work in this period.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {segments.map((s) => {
                const seg = total.segments[s];
                const profit = seg.revenueCents - seg.costCents;
                const share = pct(seg.revenueCents, total.revenueCents) ?? 0;
                return (
                  <li key={s} title={`${seg.jobs} ${s === "JANITORIAL_CONTRACTS" ? "contract month" : "job"}${seg.jobs === 1 ? "" : "s"} · job cost ${money(seg.costCents)} · profit ${money(profit)}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-gray-700">{FINANCE_SEGMENT_LABELS[s]}</span>
                      <span className="tabular-nums">
                        <span className="text-gray-900">{money(seg.revenueCents)}</span>
                        <span className={`ml-1.5 text-xs ${profit < 0 ? "text-red-600" : "text-gray-400"}`}>{pctLabel(pct(profit, seg.revenueCents))} margin</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                      <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <JobList title="Most profitable jobs" jobs={mostProfitable} emphasis="profit" />
        <JobList title="Lowest margin jobs" jobs={lowestMargin} emphasis="margin" />
      </div>

      <details className={`${cardCls} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className={cardTitleCls}>How each number is calculated</span>
          <span className="text-xs text-gray-400 group-open:hidden">Show</span>
          <span className="hidden text-xs text-gray-400 group-open:inline">Hide</span>
        </summary>
        <div className="space-y-5 border-t border-gray-100 px-4 py-4">
          <p className="text-sm text-gray-600">
            Everything here comes from what&apos;s entered in the ERP (projects, labor logs, materials, janitorial hours, payroll settings),
            starting August 2026, when the ERP came into full use. Earlier months are missing jobs and costs, so they&apos;re left out.
            It&apos;s a management view to spot trends, not an accounting report. Anything that isn&apos;t in the ERP, like rent, insurance,
            software, vehicles, or taxes, isn&apos;t included, so your bookkeeping P&amp;L is still the official number.
            Hover any number in the table for its breakdown.
          </p>
          <dl className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
            {CALCULATION_NOTES.map((n) => (
              <div key={n.term}>
                <dt className="font-medium text-gray-900">{n.term}</dt>
                <dd className="mt-1 space-y-1 text-gray-600">
                  {n.lines.map((l) => <p key={l}>{l}</p>)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}

const CALCULATION_NOTES: { term: string; lines: string[] }[] = [
  {
    term: "Revenue",
    lines: [
      "The contract value of work that's finished, counted in the month it was finished (not when it was invoiced or paid).",
      "Turnovers count on the day they were marked complete. Other projects count on their end date. Only projects with status Complete are included.",
      "Change orders are added to their project's contract value (using the change order's price, or its estimate if no price is set). Voided and rejected change orders are left out.",
      "Janitorial contracts count once per billing month: that month's contract amount plus any extra charges added to it.",
      "Completed projects with no contract value or no end date can't be counted, and are listed under data gaps at the top.",
    ],
  },
  {
    term: "Job costs",
    lines: [
      "The same numbers as the Projects table, so a job's margin here always matches what you see there.",
      "Labor: every labor log at the rate it was entered with. Hours past 40 in a week (per worker, across all their projects) are counted at 1.5x.",
      "Contractors: the cost on each contractor assignment. Materials: every material log.",
      "If a project has no labor or material logs, the actual labor or material totals typed on the project are used instead.",
      "Janitorial contracts: each janitor's hours (an admin's correction if there is one, otherwise their clock-in time, otherwise their scheduled shift, with a 30 minute unpaid break taken off shifts of 6+ hours) times their current hourly rate, the same hours Payroll pays. Overtime isn't added here. Only days up to today count for the current month.",
    ],
  },
  {
    term: "Gross profit and margin",
    lines: [
      "Revenue minus job costs. Margin is gross profit divided by revenue.",
      "This shows how profitable the work itself is, before company overhead.",
    ],
  },
  {
    term: "Overhead",
    lines: [
      "Salaries: each salaried employee's yearly salary divided by 12, every month from their hire date while they're Active. Hours they log on jobs are already in job costs, so that amount is taken back out of their salary for the month so it isn't counted twice.",
      "The ERP only stores each person's current pay, so a raise or a switch between hourly and salary applies to every month shown.",
      "Offshore pay: each offshore employee's monthly rate from their hire date, plus any month they were marked paid in Offshore Payroll.",
      "Someone marked Inactive still counts up to the day their status was changed. That last month is split by days (marked inactive on the 17th of a 30 day month counts 17/30 of the month).",
      "Commission: payouts, in the month they were marked paid. Reimbursements: in the month of the expense, whether or not it's been paid back yet.",
      "Not included: hourly employees (they're already in job costs through their labor logs), BD caller bid bonuses, and any expense not tracked in the ERP.",
    ],
  },
  {
    term: "Net profit and margin",
    lines: [
      "Gross profit minus overhead. Net margin is net profit divided by revenue.",
      "Overhead is steady every month but revenue isn't, so a single month can go negative even when the year is fine. Look at the total for the real picture.",
    ],
  },
  {
    term: "Awaiting payment",
    lines: [
      "Revenue from this period that isn't marked paid yet: projects whose billing status isn't Invoice Paid, and janitorial contract months not marked Paid on the Billing page.",
      "Jobs that were never sent to billing count here too.",
    ],
  },
  {
    term: "Comparisons",
    lines: [
      "Revenue compares against the same months of the year before (for example, August to October 2027 against August to October 2026). Since data starts August 2026, this comparison first appears in August 2027.",
      "The current month compares its total so far against all of last month, so it will look low until the month is over.",
    ],
  },
  {
    term: "Backlog and janitorial contracts",
    lines: [
      "Backlog: the contract value of projects that are Active, Upcoming, or On Hold, meaning work that's been sold but isn't finished yet. Change orders aren't included.",
      "Janitorial contracts: the monthly rate of every Active janitorial contract added together. Hover it for the yearly amount.",
    ],
  },
  {
    term: "Type of work and job lists",
    lines: [
      "Post-construction is commercial cleaning and painting. Turnovers are janitorial turnover units. Janitorial contracts are counted by contract month.",
      "Most profitable jobs are ranked by gross profit in dollars. Lowest margin jobs are ranked by margin percentage. Both only include work finished in the selected period.",
    ],
  },
];
