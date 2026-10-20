import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollarsCompact } from "@/lib/erp/money";
import { loadGcScorecard } from "@/lib/erp/winLoss";

const OUTCOME = { won: "Won", lost: "Lost", open: "Open" } as const;

/** Bids from HubSpot and how fast they pay, on a company page. Hidden when there's nothing to show. */
export async function GcScorecard({ companyId }: { companyId: string }) {
  let s: Awaited<ReturnType<typeof loadGcScorecard>> = null;
  try {
    s = await loadGcScorecard(companyId);
  } catch {
    return null;
  }
  if (!s) return null;
  const decided = s.won + s.lost;
  const stats: [string, string, string][] = [
    ["Bids", String(s.bids), "Post-construction deals in HubSpot matched to this company, any time."],
    ["Win rate", decided ? `${Math.round((s.won / decided) * 100)}%` : "-", `${s.won} won of ${decided} decided. Won means Quote Approved or later.`],
    ["GC didn't win", String(s.gcNotAwarded), "Lost bids with the reason GC Not Awarded."],
    [
      "$/sq ft won",
      s.perSqftWon == null ? "-" : `$${s.perSqftWon.toFixed(2)}`,
      `Median of won jobs, all types of work mixed. ${
        s.perSqftWonByScope.length ? `By type: ${s.perSqftWonByScope.map((x) => `${x.label} $${x.value.toFixed(2)} (${x.samples} jobs)`).join(", ")}. ` : ""
      }All their bids: ${s.perSqftQuoted == null ? "-" : `$${s.perSqftQuoted.toFixed(2)}`}.`,
    ],
    [
      "Days to pay",
      s.avgDaysToPay == null ? "-" : String(Math.round(s.avgDaysToPay)),
      `Average from invoice date to paid date over ${s.paidInvoices} paid invoices on their jobs and buildings.`,
    ],
  ];
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Scorecard
        <InfoTip text="Bids from HubSpot (refreshed hourly) and payment speed from the ERP's invoices. More on the Win/loss page." />
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value, info]) => (
          <div key={label}>
            <dt className="flex items-center gap-1 text-xs text-gray-500">
              {label}
              <InfoTip text={info} />
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {s.perSqftWonByScope.length > 1 && (
        <p className="mt-2 text-xs text-gray-500">
          $/sq ft won by type: {s.perSqftWonByScope.map((x) => `${x.label} $${x.value.toFixed(2)} (${x.samples})`).join(" · ")}
        </p>
      )}
      {s.prices.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1 text-xs font-medium text-gray-500">
            Price per sq ft
            <InfoTip text="Median of our quoted HubSpot amounts divided by Area SQFT, per type of work with 3 or more priced bids. We win at: their won jobs, once there are 3. Usual win: our won jobs of that type across all GCs. Likely typos are left out." />
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {s.prices.map((p) => {
              const gap = p.usualWon != null ? p.quoted / p.usualWon - 1 : null;
              return (
                <li key={p.scope} className="text-gray-700">
                  <span className="text-gray-900">{p.label}:</span> we quote ${p.quoted.toFixed(2)}{" "}
                  <span className="text-xs text-gray-400">({p.quotedN} bids)</span>
                  {p.won != null && (
                    <>
                      {" "}
                      · we win at ${p.won.toFixed(2)} <span className="text-xs text-gray-400">({p.wonN})</span>
                    </>
                  )}
                  {p.usualWon != null && <> · usual win ${p.usualWon.toFixed(2)}</>}
                  {gap != null && Math.abs(gap) >= 0.05 && (
                    <span className={`ml-1 text-xs ${gap > 0 ? "text-amber-700" : "text-gray-500"}`}>
                      ({Math.round(Math.abs(gap) * 100)}% {gap > 0 ? "above" : "below"})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {s.recent.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {s.recent.map((d) => (
            <li key={d.id} className="flex justify-between gap-2 py-1.5">
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-gray-900 hover:text-pink-600">
                  {d.name}
                </a>
              ) : (
                <span className="min-w-0 truncate">{d.name}</span>
              )}
              <span className="shrink-0 text-xs text-gray-500">
                {OUTCOME[d.outcome]}
                {d.cents ? ` · ${centsToDollarsCompact(d.cents)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
