import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canViewCompanies } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import { PERIODS, STALE_DAYS, WORK_SCOPES, WORK_SCOPE_LABELS, loadWinLoss, type PeriodKey, type WinLossReport, type WorkScope } from "@/lib/erp/winLoss";
import { CountBars, QuarterColumns, StackedBars } from "./WinLossCharts";

export const metadata: Metadata = { title: "Win/loss" };
export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x == null ? "-" : `${Math.round(x * 100)}%`);

function Tile({ label, value, sub, info }: { label: string; value: string; sub?: string; info: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1 text-xs font-medium text-gray-500">
        {label}
        <InfoTip text={info} />
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Card({ title, info, children, className = "" }: { title: string; info: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 flex items-center gap-1 text-sm font-semibold text-gray-900">
        {title}
        <InfoTip text={info} />
      </h2>
      {children}
    </section>
  );
}

function Body({ r }: { r: WinLossReport }) {
  const decided = r.total.won + r.total.lost;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Win rate" value={pct(r.total.winRate)} sub={`${r.total.won} won of ${decided} decided, ${r.total.open} still open`} info="Won divided by won plus lost. Open bids aren't counted. Won means Quote Approved or any later stage." />
        <Tile
          label="Won"
          value={centsToDollarsCompact(r.total.wonCents)}
          sub={`${r.total.won} jobs`}
          info={`Won jobs added up. A won job that's a project in the ERP uses its ERP contract value (${r.wonFromErp} jobs, any time); the rest use the HubSpot deal Amount.`}
        />
        <Tile label="Lost" value={centsToDollarsCompact(r.total.lostCents)} sub={`${r.total.lost} bids`} info="HubSpot deal amounts of bids marked Deal Lost." />
        <Tile
          label={r.scope ? `$ per sq ft (won, ${WORK_SCOPE_LABELS[r.scope].toLowerCase()})` : "$ per sq ft (won)"}
          value={r.perSqft.won == null ? "-" : `$${r.perSqft.won.toFixed(2)}`}
          sub={`From ${r.perSqft.wonSamples} of ${r.total.won} won jobs${r.scope ? "" : ". Mixes cleaning and painting, see by type below"}`}
          info="Median of the amount divided by HubSpot's Area SQFT. Jobs with no Area SQFT can't be divided, so they're left out of this number only; they still count everywhere else. Cleaning and painting price very differently, so compare by type of work."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="By type of work"
          info="From each deal's line items (copied from its quote): painting, cleaning or both. Deals without line items use HubSpot's Type of business. Not known means neither says. Bar length is the number of bids; the right column is the win rate."
        >
          <StackedBars rows={r.byScope} first="Type of work" />
        </Card>
        <Card
          title="$ per sq ft by type of work"
          info="Median of won jobs' amount divided by Area SQFT, per type of work, in the period picked (the type filter doesn't apply here, so they can be compared). Under each: how many won jobs had sq ft to go on. Few jobs means a shaky number."
        >
          <div className="grid grid-cols-2 gap-3">
            {r.sqftByScope
              .filter((x) => x.scope !== "UNKNOWN" || x.wonJobs > 0)
              .map((x) => (
                <div key={x.scope} className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{x.label}</p>
                  <p className="text-xl font-semibold text-gray-900">{x.won == null ? "-" : `$${x.won.toFixed(2)}`}</p>
                  <p className={`text-xs ${x.wonSamples < 5 ? "text-amber-700" : "text-gray-500"}`}>
                    {x.wonSamples} of {x.wonJobs} won jobs{x.wonSamples > 0 && x.wonSamples < 5 ? ", too few to trust" : ""}
                  </p>
                  {x.all != null && <p className="text-xs text-gray-400">All bids: ${x.all.toFixed(2)}</p>}
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card title="Win rate by quarter" info="Bids by the quarter they came in: won and lost stacked, win rate on top. Open bids aren't in the bars because they aren't decided yet, so the latest quarters fill in over time. Hover a quarter for details.">
        <QuarterColumns rows={r.byQuarter} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Why we lose" info="HubSpot's Deal Lost Reason on lost bids, with each reason's share of all losses. No reason given (gray) means the field was left blank in HubSpot.">
          <CountBars items={r.lossReasons.map((x) => ({ label: x.reason, count: x.count, cents: x.cents, share: x.share, muted: x.reason === "No reason given" }))} />
        </Card>
        <Card title="By job size" info="Bids grouped by amount. Bar length is the number of bids; the right column is the win rate. Hover for dollars.">
          <StackedBars rows={r.bySize} first="Amount" />
        </Card>
      </div>

      <Card
        title="By GC"
        info="The deal's Company, matched to Companies by name or other names, or the GC at the end of the deal name. Bar length is the number of bids; the right column is the win rate. Linked names open the company's scorecard. Add other spellings on a company to merge them."
      >
        <StackedBars rows={r.byGc} first="Company" limit={15} />
      </Card>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Stale quotes ({r.stale.length})
          <InfoTip text={`Bids in Quote Sent, Negotiation or Competitive Quote with no activity in HubSpot for ${STALE_DAYS} days or more, biggest first. Any time, not just the period above.`} />
        </h2>
        {r.stale.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">None.</p>
        ) : (
          <div className="mt-2 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {r.stale.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-2">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-gray-900 hover:text-pink-600">
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                      <span className="ml-2 text-xs text-gray-500">
                        {s.stage.trim()}
                        {s.owner ? ` · ${s.owner}` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs text-gray-500">{s.daysQuiet}d quiet</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{s.cents ? centsToDollars(s.cents) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function filterHref(period: PeriodKey, scope: WorkScope | null): string {
  return `/erp/win-loss?period=${period}${scope ? `&type=${scope}` : ""}`;
}

const pill = (on: boolean) => `rounded-md px-3 py-1.5 ${on ? "bg-pink-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`;

export default async function WinLossPage({ searchParams }: { searchParams: Promise<{ period?: string; type?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) redirect("/erp");
  const { period: raw, type } = await searchParams;
  const period: PeriodKey = PERIODS.some((p) => p.key === raw) ? (raw as PeriodKey) : "12m";
  const scope: WorkScope | null = (WORK_SCOPES as readonly string[]).includes(type ?? "") ? (type as WorkScope) : null;

  let report: WinLossReport | null = null;
  let error: string | null = null;
  try {
    report = await loadWinLoss(period, new Date(), undefined, scope);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
          Win/loss
          <InfoTip text="Post-construction bids from HubSpot, counted by when they came in. Read live from HubSpot and refreshed every hour." />
        </h1>
      </div>
      {/* Filters scope everything below them. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <nav className="flex flex-wrap gap-1" aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p.key} href={filterHref(p.key, scope)} className={pill(p.key === period)}>
              {p.label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1" aria-label="Type of work">
          <Link href={filterHref(period, null)} className={pill(scope === null)}>
            All work
          </Link>
          {WORK_SCOPES.filter((k) => k !== "UNKNOWN").map((k) => (
            <Link key={k} href={filterHref(period, k)} className={pill(scope === k)}>
              {WORK_SCOPE_LABELS[k]}
            </Link>
          ))}
        </nav>
      </div>
      {error || !report ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t read HubSpot: {error}</p>
      ) : (
        <>
          <Body r={report} />
          <p className="text-xs text-gray-400">From HubSpot as of {new Date(report.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}.</p>
        </>
      )}
    </div>
  );
}
