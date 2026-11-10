import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canSeeFinanceDashboard } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { prisma } from "@/lib/prisma";
import {
  loadMetaAds,
  parseMetaPeriod,
  META_PERIODS,
  CAMPAIGN_KINDS,
  type CampaignKind,
  type MetaRow,
  type MetaMonthRow,
} from "@/lib/erp/metaAds";

export const metadata: Metadata = { title: "Ad spend" };
export const dynamic = "force-dynamic";

// Same blue and orange as the Finance dashboard; aqua third. Color follows what
// the campaign is for, never its rank, so Hiring is always blue.
const KIND: Record<CampaignKind, { label: string; color: string; hint: string }> = {
  HIRING: { label: "Hiring", color: "#2a78d6", hint: "Job ads for cleaners, painters and crew" },
  FRANCHISE: { label: "Franchise", color: "#eb6834", hint: "Ads for people who want to open a Sueep franchise" },
  OTHER: { label: "Other", color: "#1baf7a", hint: "Anything else, like real estate agent leads" },
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Rounded for big figures and chart caps ($512, $1.3k). */
function short(cents: number): string {
  const d = Math.abs(cents / 100);
  if (d < 1000) return `$${Math.round(d)}`;
  return `$${(d / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

function perLead(cents: number, leads: number): string {
  return leads > 0 ? money(Math.round(cents / leads)) : "-";
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function monthShort(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function monthLong(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** ERP leads created in the same dates, from every source (not only Meta). */
async function erpLeadCounts(since: string | null, until: string | null) {
  if (!since || !until) return null;
  const gte = new Date(`${since}T00:00:00Z`);
  const lt = new Date(`${until}T00:00:00Z`);
  lt.setUTCDate(lt.getUTCDate() + 1);
  const [franchise, field] = await Promise.all([
    prisma.franchiseInquiry.count({ where: { createdAt: { gte, lt } } }),
    prisma.candidateApplication.count({ where: { track: "FIELD", createdAt: { gte, lt } } }),
  ]);
  return { FRANCHISE: franchise, HIRING: field };
}

const cardCls = "rounded-lg border border-gray-200 bg-white p-4 shadow-sm";
const titleCls = "text-sm font-semibold text-gray-900";

/**
 * A change against the previous period. `goodWhenUp` decides the color; the
 * arrow and words carry the direction too, so it never relies on color alone.
 */
function Delta({ now, before, goodWhenUp, label }: { now: number; before: number | null; goodWhenUp: boolean | null; label: string }) {
  if (before == null) return null;
  if (before === 0) return now === 0 ? <p className="mt-1 text-xs text-gray-400">Same as {label}</p> : <p className="mt-1 text-xs text-gray-400">None in {label}</p>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <p className="mt-1 text-xs text-gray-400">Same as {label}</p>;
  const up = change > 0;
  const tone = goodWhenUp == null ? "text-gray-500" : up === goodWhenUp ? "text-emerald-700" : "text-red-600";
  return (
    <p className={`mt-1 text-xs ${tone}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {Math.abs(change)}% {up ? "more" : "less"} than {label}
    </p>
  );
}

function StatTile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={cardCls}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub ? <p className="text-xs text-gray-400">{sub}</p> : null}
      {children}
    </div>
  );
}

/** Spend split by what it was for: one tall bar, each part labeled inside when it fits. */
function SplitBar({ parts, total }: { parts: { kind: CampaignKind; row: MetaRow }[]; total: number }) {
  return (
    <div className="flex h-7 w-full gap-0.5" role="img" aria-label={parts.map((p) => `${KIND[p.kind].label} ${money(p.row.spendCents)}`).join(", ")}>
      {parts.map((p) => {
        const share = Math.round((p.row.spendCents / total) * 100);
        return (
          <div
            key={p.kind}
            className="flex min-w-0 items-center rounded px-2 text-xs font-semibold text-white"
            style={{ flexGrow: p.row.spendCents, flexBasis: 0, backgroundColor: KIND[p.kind].color }}
            title={`${KIND[p.kind].label}: ${money(p.row.spendCents)} (${share}%)`}
          >
            {share >= 12 ? `${share}%` : ""}
          </div>
        );
      })}
    </div>
  );
}

/** Spend per month as stacked columns by kind, hover for the numbers, leads and cost per lead under each month. */
function MonthsChart({ months }: { months: MetaMonthRow[] }) {
  const max = Math.max(...months.map((m) => m.spendCents), 1);
  const used = CAMPAIGN_KINDS.filter((k) => months.some((m) => m.byKind[k].spendCents > 0));
  const current = new Date().toISOString().slice(0, 7);
  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={titleCls}>Spend by month</h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          {used.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND[k].color }} />
              {KIND[k].label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-end gap-1.5 border-b border-gray-200 sm:gap-3" style={{ height: 170 }}>
        {months.map((m, idx) => {
          const h = (m.spendCents / max) * 85;
          return (
            <div key={m.month} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none">
              {m.spendCents > 0 ? (
                <span className="mb-1 hidden text-[11px] tabular-nums text-gray-600 sm:block">{short(m.spendCents)}</span>
              ) : null}
              <div className="flex w-full max-w-9 flex-col-reverse gap-0.5" style={{ height: `${h}%` }}>
                {used.map((k, i) =>
                  m.byKind[k].spendCents > 0 ? (
                    <div
                      key={k}
                      className={i === used.length - 1 || used.slice(i + 1).every((kk) => m.byKind[kk].spendCents === 0) ? "rounded-t" : ""}
                      style={{ flexGrow: m.byKind[k].spendCents, flexBasis: 0, backgroundColor: KIND[k].color }}
                    />
                  ) : null,
                )}
              </div>
              {/* Hover / focus card */}
              <div className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-52 rounded-md ${idx < 3 ? "left-0" : idx > months.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2"} border border-gray-200 bg-white p-3 text-xs shadow-lg group-hover:block group-focus:block`}>
                <p className="font-semibold text-gray-900">
                  {monthLong(m.month)}
                  {m.month === current ? " (so far)" : ""}
                </p>
                <p className="mt-1 flex justify-between text-gray-900">
                  <span>Spend</span>
                  <span className="tabular-nums">{money(m.spendCents)}</span>
                </p>
                {used.map((k) =>
                  m.byKind[k].spendCents > 0 ? (
                    <p key={k} className="flex justify-between gap-2 text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND[k].color }} />
                        {KIND[k].label}
                      </span>
                      <span className="tabular-nums">
                        {money(m.byKind[k].spendCents)} · {num(m.byKind[k].leads)} lead{m.byKind[k].leads === 1 ? "" : "s"}
                      </span>
                    </p>
                  ) : null,
                )}
                <p className="mt-1 flex justify-between border-t border-gray-100 pt-1 text-gray-600">
                  <span>Cost per lead</span>
                  <span className="tabular-nums">{perLead(m.spendCents, m.leads)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {months.map((m) => (
          <div key={m.month} className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs text-gray-600">
              {monthShort(m.month)}
              {m.month === current ? "*" : ""}
            </p>
            <p className="truncate text-[11px] tabular-nums text-gray-400" title="Cost per lead">
              {m.leads > 0 ? short(Math.round(m.spendCents / m.leads)) : ""}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">Under each month: cost per lead. Hover a month for the details. * so far</p>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs text-gray-500 hover:text-gray-800">
          <span className="group-open:hidden">Show table</span>
          <span className="hidden group-open:inline">Hide table</span>
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1 text-left font-medium">Month</th>
                <th className="py-1 text-right font-medium">Spend</th>
                <th className="py-1 text-right font-medium">Leads</th>
                <th className="py-1 text-right font-medium">Cost per lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...months].reverse().filter((m) => m.spendCents > 0).map((m) => (
                <tr key={m.month}>
                  <td className="py-1.5 text-gray-700">{monthLong(m.month)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-900">{money(m.spendCents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{num(m.leads)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-900">{perLead(m.spendCents, m.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Drop the empty months before the first spend, keeping at least the last 3. */
function trimLeadingEmpty(months: MetaMonthRow[]): MetaMonthRow[] {
  const first = months.findIndex((m) => m.spendCents > 0);
  if (first < 0) return months.slice(-3);
  return months.slice(Math.min(first, Math.max(months.length - 3, 0)));
}

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinanceDashboard(auth.role)) redirect("/erp");
  const period = parseMetaPeriod((await searchParams).period);
  const periodLabel = META_PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  const report = await loadMetaAds(period);
  const erp = report.ok ? await erpLeadCounts(report.since, report.until) : null;

  const byKind = report.ok
    ? CAMPAIGN_KINDS.map((kind) => ({
        kind,
        row: report.campaigns.filter((c) => c.kind === kind).reduce<MetaRow>(
          (s, c) => ({ spendCents: s.spendCents + c.spendCents, impressions: s.impressions + c.impressions, clicks: s.clicks + c.clicks, leads: s.leads + c.leads }),
          { spendCents: 0, impressions: 0, clicks: 0, leads: 0 },
        ),
      })).filter((k) => k.row.spendCents > 0)
    : [];
  const maxCampaign = report.ok ? Math.max(...report.campaigns.map((c) => c.spendCents), 1) : 1;
  const prevLabel = "the period before";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/erp?tab=finance" className="text-xs text-gray-500 hover:text-pink-600">← Finance</Link>
          <h1 className="mt-1 flex items-center gap-1 text-2xl font-semibold text-gray-900">
            Ad spend
            <InfoTip
              text="What we spent on Facebook and Instagram ads, straight from Meta, refreshed every hour. Leads are what Meta counts: forms filled on Facebook plus website forms the Meta Pixel saw. QuickBooks already has these charges, so they're not added to the Finance dashboard again."
              wide
            />
          </h1>
          {report.ok && report.since && report.until ? (
            <p className="text-xs text-gray-500">{dayLabel(report.since)} to {dayLabel(report.until)}</p>
          ) : null}
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {META_PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/erp/ads?period=${p.key}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                p.key === period ? "border-pink-600 bg-pink-50 text-pink-700" : "border-gray-200 bg-white text-gray-600 hover:border-pink-300"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {!report.ok ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {report.reason === "NOT_CONFIGURED" ? report.message : `Couldn't load ad spend from Meta: ${report.message}`}
        </p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Spent" value={money(report.total.spendCents)}>
              <Delta now={report.total.spendCents} before={report.previous?.spendCents ?? null} goodWhenUp={null} label={prevLabel} />
            </StatTile>
            <StatTile label="Leads" value={num(report.total.leads)}>
              <Delta now={report.total.leads} before={report.previous?.leads ?? null} goodWhenUp label={prevLabel} />
            </StatTile>
            <StatTile label="Cost per lead" value={perLead(report.total.spendCents, report.total.leads)}>
              {report.previous && report.previous.leads > 0 && report.total.leads > 0 ? (
                <Delta
                  now={report.total.spendCents / report.total.leads}
                  before={report.previous.spendCents / report.previous.leads}
                  goodWhenUp={false}
                  label={prevLabel}
                />
              ) : null}
            </StatTile>
            <StatTile label="Clicks" value={num(report.total.clicks)} sub={`${perLead(report.total.spendCents, report.total.clicks)} per click`}>
              <Delta now={report.total.clicks} before={report.previous?.clicks ?? null} goodWhenUp label={prevLabel} />
            </StatTile>
          </div>

          {report.total.spendCents === 0 ? (
            <p className={`${cardCls} text-sm text-gray-500`}>No ad spend in {periodLabel}.</p>
          ) : (
            <section className={cardCls}>
              <h2 className={titleCls}>What the money was for</h2>
              <div className="mt-3">
                <SplitBar parts={byKind} total={report.total.spendCents} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {byKind.map(({ kind, row }) => {
                  const erpCount = kind === "OTHER" ? null : erp?.[kind] ?? null;
                  return (
                    <div key={kind} className="rounded-md border border-gray-100 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600" title={KIND[kind].hint}>
                        <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: KIND[kind].color }} />
                        {KIND[kind].label}
                      </p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{money(row.spendCents)}</p>
                      <p className="text-sm text-gray-600">
                        {row.leads === 0 ? (
                          "No leads"
                        ) : (
                          <>
                            {num(row.leads)} lead{row.leads === 1 ? "" : "s"} · <span className="font-medium text-gray-900">{perLead(row.spendCents, row.leads)}</span> each
                          </>
                        )}
                      </p>
                      {erpCount != null ? (
                        <p className="mt-1 text-xs text-gray-400">
                          <Link href={kind === "FRANCHISE" ? "/erp/franchise" : "/erp/candidates"} className="hover:text-pink-600">
                            {num(erpCount)} {kind === "FRANCHISE" ? "franchise inquiries" : "field applications"} in the ERP
                          </Link>{" "}
                          (all sources)
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <MonthsChart months={trimLeadingEmpty(report.months)} />

          {report.campaigns.length > 0 ? (
            <section className={cardCls}>
              <h2 className={titleCls}>Campaigns</h2>
              <ul className="mt-3 space-y-3">
                {report.campaigns.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-1.5 text-gray-900">
                        <span aria-hidden className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ backgroundColor: KIND[c.kind].color }} />
                        <span className="min-w-0 break-words">
                          {c.name}
                          {c.name.toLowerCase().includes(KIND[c.kind].label.toLowerCase()) ? null : <span className="ml-1.5 text-xs text-gray-400">{KIND[c.kind].label}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-900">{money(c.spendCents)}</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full" style={{ width: `${(c.spendCents / maxCampaign) * 100}%`, backgroundColor: KIND[c.kind].color }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.leads === 0 ? "No leads" : `${num(c.leads)} lead${c.leads === 1 ? "" : "s"} · ${perLead(c.spendCents, c.leads)} per lead`} · {num(c.clicks)} clicks
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-xs text-gray-400">
            ERP counts include every source (website, Indeed, walk-ins), because the website forms don&apos;t record yet whether someone came from an ad. Use them as a rough check against Meta&apos;s lead count.
          </p>
        </>
      )}
    </div>
  );
}
