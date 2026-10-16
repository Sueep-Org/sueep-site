import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canViewCompanies } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import { PERIODS, STALE_DAYS, loadWinLoss, type PeriodKey, type WinLossReport } from "@/lib/erp/winLoss";
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
          label="$ per sq ft (won)"
          value={r.perSqft.won == null ? "-" : `$${r.perSqft.won.toFixed(2)}`}
          sub={`From ${r.perSqft.wonSamples} of ${r.total.won} won jobs${r.perSqft.all == null ? "" : `. All bids: $${r.perSqft.all.toFixed(2)}`}`}
          info="Median of the amount divided by HubSpot's Area SQFT. Jobs with no Area SQFT can't be divided, so they're left out of this number only; they still count everywhere else. The more jobs have sq ft filled in, the more reliable it is."
        />
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

export default async function WinLossPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) redirect("/erp");
  const { period: raw } = await searchParams;
  const period: PeriodKey = PERIODS.some((p) => p.key === raw) ? (raw as PeriodKey) : "12m";

  let report: WinLossReport | null = null;
  let error: string | null = null;
  try {
    report = await loadWinLoss(period);
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
        <nav className="ml-auto flex gap-1 text-sm" aria-label="Period">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/erp/win-loss?period=${p.key}`}
              className={`rounded-md px-3 py-1.5 ${p.key === period ? "bg-pink-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {p.label}
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
