import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canEditCompanies, canViewCompanies } from "@/lib/erpAuth";
import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import { PERIODS, STALE_DAYS, loadWinLoss, type PeriodKey, type WinLossReport } from "@/lib/erp/winLoss";
import { WORK_SCOPES, WORK_SCOPE_LABELS, type WorkScope } from "@/lib/erp/postConDeals";
import { CountBars, QuarterColumns, StackedBars } from "./WinLossCharts";
import { WinLossFilter } from "./WinLossFilter";
import { PriceDots } from "./PriceDots";
import { LossTrend } from "./LossTrend";
import { DetailTabs } from "@/app/erp/components/DetailTabs";

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

function Body({ r, canLink }: { r: WinLossReport; canLink: boolean }) {
  const decided = r.total.won + r.total.lost;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Win rate"
          value={pct(r.total.winRate)}
          sub={`${r.total.won} won of ${decided} decided, ${r.total.open} still open`}
          info="Won divided by won plus lost. Open bids aren't counted. Won means Quote Approved or any later stage."
        />
        <Tile
          label="Won"
          value={centsToDollarsCompact(r.total.wonCents)}
          sub={`${r.total.won} jobs`}
          info={`Won jobs added up. A won job that's a project in the ERP uses its ERP contract value (${r.wonFromErp} jobs, any time); the rest use the HubSpot deal Amount.`}
        />
        <Tile
          label="Lost"
          value={centsToDollarsCompact(r.total.lostCents)}
          sub={`${r.total.lost} bids`}
          info="HubSpot deal amounts of bids marked Deal Lost."
        />
        <Tile
          label={r.scope ? `$ per sq ft (won, ${WORK_SCOPE_LABELS[r.scope].toLowerCase()})` : "$ per sq ft (won)"}
          value={r.perSqft.won == null ? "-" : `$${r.perSqft.won.toFixed(2)}`}
          sub={`From ${r.perSqft.wonSamples} of ${r.total.won} won jobs${r.scope ? "" : ". Mixes cleaning and painting, see by type below"}`}
          info="Median of the amount divided by HubSpot's Area SQFT. Jobs with no Area SQFT can't be divided, so they're left out of this number only; they still count everywhere else. Cleaning and painting price very differently, so compare by type of work."
        />
      </div>

      {/* Same filter for every tab; the tab is kept in the URL (?tab=). */}
      <DetailTabs
        tabs={[
          {
            label: "Overview",
            content: (
              <div className="space-y-4">
                <Card
                  title="Win rate by quarter"
                  info="Bids by the quarter they came in: won and lost stacked, win rate on top. Open bids aren't in the bars because they aren't decided yet, so the latest quarters fill in over time. Hover a quarter for details."
                >
                  <QuarterColumns rows={r.byQuarter} />
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card
                    title="By type of work"
                    info="From each deal's line items (copied from its quote): painting, cleaning or both. Deals without line items use HubSpot's Type of business. Not known means neither says. Bar length is the number of bids; the right column is the win rate."
                  >
                    <StackedBars rows={r.byScope} first="Type of work" />
                  </Card>
                  <Card
                    title="By job size"
                    info="Bids grouped by amount. Bar length is the number of bids; the right column is the win rate. Hover for dollars."
                  >
                    <StackedBars rows={r.bySize} first="Amount" />
                  </Card>
                </div>
              </div>
            ),
          },
          {
            label: "Price",
            content: (
              <div className="space-y-4">
                <Card
                  title="Price: won vs lost"
                  info="Each dot is a won or lost bid in the period, placed by its price per sq ft (amount divided by HubSpot's Area SQFT), one strip per type of work. The dark line in each row is the median. Lost for Price are lost bids whose reason was Price (they're in Lost too). Bids priced 3 times the middle or more (or a third or less) are left out as likely typos. Hover a dot for the deal; click to open it in HubSpot."
                >
                  <PriceDots scopes={r.priceDots} />
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
            ),
          },
          {
            label: "Losses",
            content: (
              <div className="space-y-4">
                <Card
                  title="Why we lose, by quarter"
                  info="Lost deals that came in each quarter since 2023 (when lost reasons started being filled in), split by their main reason. Each bar is 100% of that quarter's losses; the number on top is how many. A deal with several reasons counts once, under the first of GC not awarded, Price, No answer, Did not move forward. Follows the type of work filter, not the period. Hover a segment for its count."
                >
                  <LossTrend quarters={r.lossTrend} />
                </Card>

                <Card
                  title="Why we lose"
                  info="HubSpot's Deal Lost Reason on lost bids, with each reason's share of all losses. No reason given (gray) means the field was left blank in HubSpot."
                >
                  <CountBars
                    items={r.lossReasons.map((x) => ({
                      label: x.reason,
                      count: x.count,
                      cents: x.cents,
                      share: x.share,
                      muted: x.reason === "No reason given",
                    }))}
                  />
                </Card>

                <Card
                  title="Re-bids with the GC that won"
                  info="Bids in the period lost because our GC wasn't awarded the job. With winner: someone recorded which GC got it (Mark lost or Who won? on the Pipeline board). Re-bids: new deals made from those with the winning GC, and how they turned out. Any period's re-bid can still be open."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "GC not awarded", value: String(r.rebids.gcNotAwarded) },
                      { label: "With winner", value: String(r.rebids.withWinner) },
                      { label: "Re-bids", value: String(r.rebids.rebids) },
                      {
                        label: "Re-bids won",
                        value: `${r.rebids.won}`,
                        sub: r.rebids.rebids
                          ? `${r.rebids.lost} lost, ${r.rebids.open} open${r.rebids.wonCents ? `, ${centsToDollarsCompact(r.rebids.wonCents)}` : ""}`
                          : undefined,
                      },
                    ].map((x) => (
                      <div key={x.label} className="rounded-md bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">{x.label}</p>
                        <p className="text-xl font-semibold text-gray-900">{x.value}</p>
                        {x.sub && <p className="text-xs text-gray-500">{x.sub}</p>}
                      </div>
                    ))}
                  </div>
                </Card>

                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                    Stale quotes ({r.stale.length})
                    <InfoTip
                      text={`Bids in Quote Sent, Negotiation or Competitive Quote with no activity in HubSpot for ${STALE_DAYS} days or more, biggest first. Any time, not just the period above.`}
                    />
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
              </div>
            ),
          },
          {
            label: "Clients",
            content: (
              <div className="space-y-4">
                <Card
                  title="By GC"
                  info="General contractors only: the deal's Company, matched to Companies by name or other names, or the GC at the end of the deal name. Not linked: a GC name that matches no company (see Link companies). No company: the deal has no GC at all, often a direct or existing client job. Bar length is the number of bids; the right column is the win rate. Linked names open the company's scorecard."
                >
                  <StackedBars rows={r.byGc} first="Company" limit={15} />
                </Card>

                <Card
                  title="By property manager and owner"
                  info="Clients who hire us directly (company type Property manager or Owner). Bids and win rate cover their deals in both pipelines that came in during the period; the type of work filter doesn't apply here. Buildings, janitorial contracts (active, with monthly value), turnovers finished in the last 90 days and average days to pay are as of today."
                >
                  {r.byClient.length === 0 ? (
                    <p className="text-sm text-gray-500">No property manager or owner companies yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500">
                            <th className="pb-1 pr-2 font-medium">Company</th>
                            <th className="px-2 pb-1 text-right font-medium">Bids</th>
                            <th className="px-2 pb-1 text-right font-medium">Win rate</th>
                            <th className="px-2 pb-1 text-right font-medium">Buildings</th>
                            <th className="px-2 pb-1 text-right font-medium">Janitorial</th>
                            <th className="px-2 pb-1 text-right font-medium">Turnovers 90d</th>
                            <th className="pb-1 pl-2 text-right font-medium">Days to pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {r.byClient.map((c) => (
                            <tr key={c.companyId}>
                              <td className="py-1.5 pr-2">
                                <Link href={`/erp/companies/${c.companyId}`} className="text-gray-900 hover:text-pink-600">
                                  {c.name}
                                </Link>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{c.bids || "-"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {pct(c.winRate)}
                                {c.won + c.lost > 0 && (
                                  <span className="ml-1 text-xs text-gray-400">
                                    {c.won}/{c.won + c.lost}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{c.buildings || "-"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {c.contracts ? (
                                  <>
                                    {c.contracts}
                                    <span className="ml-1 text-xs text-gray-500">{centsToDollarsCompact(c.contractMonthlyCents)}/mo</span>
                                  </>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{c.turnovers90 || "-"}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{c.avgDaysToPay != null ? Math.round(c.avgDaysToPay) : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                {canLink && r.unlinked.length > 0 && (
                  <Card
                    title="Link companies"
                    info="Company names on deals in the period that match no company in the ERP, most bids first. Linking them (add the company, or add the name as another name on an existing one) puts their deals under the right GC or property manager everywhere. Only Admins and the Business Manager see this."
                  >
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {r.unlinked.map((u) => (
                          <tr key={`${u.pipeline}-${u.name}`}>
                            <td className="py-1.5 pr-2 text-gray-900">
                              {u.name}
                              {u.pipeline === "janitorial" && <span className="ml-1 text-xs text-gray-400">janitorial</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs text-gray-500">
                              {u.bids} bids{u.won ? `, ${u.won} won` : ""}
                            </td>
                            <td className="py-1.5 pl-2 text-right">
                              <Link href={`/erp/companies?q=${encodeURIComponent(u.name)}`} className="text-xs text-pink-600 hover:underline">
                                Link
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

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
        {/* The filter scopes everything below it; this says what's picked. */}
        <span className="text-sm text-gray-500">
          {PERIODS.find((p) => p.key === period)?.label} · {scope ? WORK_SCOPE_LABELS[scope] : "All work"}
        </span>
        <div className="ml-auto">
          <WinLossFilter
            period={period}
            scope={scope ?? ""}
            defaultPeriod="12m"
            periods={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            scopes={[{ value: "", label: "All work" }, ...WORK_SCOPES.filter((k) => k !== "UNKNOWN").map((k) => ({ value: k, label: WORK_SCOPE_LABELS[k] }))]}
          />
        </div>
      </div>
      {error || !report ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t read HubSpot: {error}</p>
      ) : (
        <>
          <Body r={report} canLink={canEditCompanies(auth.role)} />
          <p className="text-xs text-gray-400">From HubSpot as of {new Date(report.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}.</p>
        </>
      )}
    </div>
  );
}
