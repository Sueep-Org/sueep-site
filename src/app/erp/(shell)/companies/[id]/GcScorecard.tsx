import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollarsCompact } from "@/lib/erp/money";
import { CHART, fullDate, money2, pct } from "@/lib/erp/pipelineUi";
import { loadGcScorecard } from "@/lib/erp/winLoss";

const OUTCOME = {
  won: { label: "Won", className: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", className: "bg-orange-50 text-orange-700" },
  open: { label: "Open", className: "bg-gray-100 text-gray-600" },
} as const;

const SECTION = "rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2";

function Title() {
  return (
    <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
      Scorecard
      <InfoTip text="Bids from HubSpot (changes show within a couple of minutes) and payment speed from the ERP's invoices. More on the Win/loss page." />
    </h2>
  );
}

function Tile({ label, info, value, sub, warn }: { label: string; info: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <p className="flex items-center gap-1 text-xs text-gray-500">
        {label}
        <InfoTip text={info} />
      </p>
      <p className={`text-xl font-semibold tabular-nums ${warn ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      {sub && <p className={`text-[11px] ${warn ? "text-amber-700" : "text-gray-500"}`}>{sub}</p>}
    </div>
  );
}

/** Shown while the scorecard loads, so the company page opens right away. */
export function GcScorecardSkeleton() {
  return (
    <section className={SECTION} aria-busy="true">
      <Title />
      <div className="mt-3 animate-pulse space-y-3">
        <div className="flex gap-4">
          <div className="h-10 w-20 rounded bg-gray-100" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 rounded bg-gray-100" />
            <div className="h-2.5 w-1/2 rounded bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-md bg-gray-100" />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Bids from HubSpot and how fast they pay, on a company page. Hidden when there's nothing to show. */
export async function GcScorecard({ companyId, paymentTermsDays }: { companyId: string; paymentTermsDays: number | null }) {
  let s: Awaited<ReturnType<typeof loadGcScorecard>> = null;
  try {
    s = await loadGcScorecard(companyId);
  } catch {
    return null;
  }
  if (!s) return null;
  const decided = s.won + s.lost;
  const vsUs = s.winRate != null && s.ourWinRate != null ? s.winRate - s.ourWinRate : null;
  const days = s.avgDaysToPay == null ? null : Math.round(s.avgDaysToPay);
  const slowPayer = days != null && paymentTermsDays != null && days > paymentTermsDays;
  const bar = [
    { label: "Won", n: s.won, color: CHART.won },
    { label: "Lost", n: s.lost, color: CHART.lost },
    { label: "Open", n: s.open, color: CHART.open },
  ];

  return (
    <section className={SECTION}>
      <Title />

      {s.bids > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-3xl font-semibold tabular-nums text-gray-900">{pct(s.winRate)}</p>
            <p className="flex items-center gap-1 text-xs text-gray-500">
              win rate
              {vsUs != null && (
                <span className={vsUs >= 0 ? "font-medium text-emerald-700" : "text-gray-500"}>
                  · {vsUs >= 0 ? "above" : "below"} our {pct(s.ourWinRate)}
                </span>
              )}
              <InfoTip text={`${s.won} won of ${decided} decided. Won means Quote Approved or later. Our average is every decided post-construction bid.`} />
            </p>
          </div>
          <div className="min-w-[14rem] flex-1">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded">
              {bar
                .filter((x) => x.n > 0)
                .map((x) => (
                  <div key={x.label} title={`${x.label}: ${x.n}`} style={{ width: `${(x.n / s.bids) * 100}%`, background: x.color }} />
                ))}
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-gray-600">
              {bar.map((x) => (
                <span key={x.label} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: x.color }} />
                  {x.label} <span className="font-semibold tabular-nums text-gray-900">{x.n}</span>
                </span>
              ))}
              {s.wonCents > 0 && <span className="text-gray-500">{centsToDollarsCompact(s.wonCents)} won</span>}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Bids" value={String(s.bids)} info="Post-construction deals in HubSpot matched to this company, any time." />
        <Tile
          label="GC didn't win"
          value={String(s.gcNotAwarded)}
          sub={s.lost ? `of ${s.lost} lost` : undefined}
          info="Lost bids with the reason GC Not Awarded: we were fine, the GC lost the job."
        />
        <Tile
          label="Days to pay"
          value={days == null ? "-" : String(days)}
          sub={paymentTermsDays != null ? `terms ${paymentTermsDays} days` : s.paidInvoices ? `${s.paidInvoices} paid invoices` : undefined}
          warn={slowPayer}
          info={`Average from invoice date to paid date over ${s.paidInvoices} paid invoices on their jobs and buildings.${slowPayer ? " Amber: slower than their payment terms." : ""}`}
        />
        {s.prices.length === 0 && s.perSqftWon != null && (
          <Tile label="$/sq ft won" value={money2(s.perSqftWon)} info="Median of won jobs, all types of work mixed." />
        )}
      </div>

      {s.prices.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1 text-xs font-medium text-gray-500">
            Price per sq ft
            <InfoTip text="Median of our quoted HubSpot amounts divided by Area SQFT, per type of work with 3 or more priced bids. We win at: their won jobs, once there are 3. Usual win: our won jobs of that type across all GCs. Likely typos are left out." />
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-gray-500">
            {[
              { label: "We quote them", color: CHART.ink },
              { label: "We win with them", color: CHART.won },
              { label: "Our usual win", color: CHART.muted },
            ].map((k) => (
              <span key={k.label} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: k.color }} />
                {k.label}
              </span>
            ))}
          </div>
          <ul className="mt-2 space-y-3">
            {s.prices.map((p) => {
              const gap = p.usualWon != null ? p.quoted / p.usualWon - 1 : null;
              const rows = [
                { key: "q", v: p.quoted, sub: `${p.quotedN} bids`, color: CHART.ink },
                ...(p.won != null ? [{ key: "w", v: p.won, sub: `${p.wonN} wins`, color: CHART.won }] : []),
                ...(p.usualWon != null ? [{ key: "u", v: p.usualWon, sub: "all GCs", color: CHART.muted }] : []),
              ];
              // Each type on its own scale: painting runs several times cleaning, which would flatten the cleaning bars.
              const max = Math.max(...rows.map((r) => r.v), 0.01);
              return (
                <li key={p.scope}>
                  <p className="flex items-center gap-2 text-sm text-gray-900">
                    {p.label}
                    {gap != null && Math.abs(gap) >= 0.05 && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${gap > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                        {Math.round(Math.abs(gap) * 100)}% {gap > 0 ? "above" : "below"} usual
                      </span>
                    )}
                  </p>
                  <div className="mt-1 space-y-1">
                    {rows.map((r) => (
                      <div key={r.key} className="flex items-center gap-2 text-xs">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-gray-50">
                          <div className="h-full rounded-sm" style={{ width: `${(r.v / max) * 100}%`, background: r.color }} />
                        </div>
                        <span className="w-12 text-right font-semibold tabular-nums text-gray-900">{money2(r.v)}</span>
                        <span className="w-14 text-gray-400">{r.sub}</span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {s.recent.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500">Recent bids</p>
          <ul className="mt-1 divide-y divide-gray-100 text-sm">
            {s.recent.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-1.5">
                <span className={`w-12 shrink-0 rounded-full py-0.5 text-center text-[11px] font-medium ${OUTCOME[d.outcome].className}`}>{OUTCOME[d.outcome].label}</span>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-gray-900 hover:text-pink-600">
                    {d.name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-gray-900">{d.name}</span>
                )}
                <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{fullDate(d.created)}</span>
                <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-gray-700">{d.cents ? centsToDollarsCompact(d.cents) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
