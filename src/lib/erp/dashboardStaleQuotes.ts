import type { CardSection, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { STALE_DAYS, dealUrl, loadDealBundle, outcomeOf, quotePriceCheck, staleQuotes, type Bundle, type PriceCheckRow } from "./winLoss";

const SHOWN = 15;
/** How far ahead "Bids due" looks, and how close counts as urgent (red number). */
const DUE_WINDOW_DAYS = 30;
const URGENT_DAYS = 3;

function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function inDays(todayKey: string, key: string): string {
  const n = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

/** Bid due dates and job walks from today through DUE_WINDOW_DAYS, soonest first. Lost bids are left off. */
function bidsDueSection(bundle: Bundle, todayKey: string): CardSection {
  const last = addDaysKey(todayKey, DUE_WINDOW_DAYS);
  const urgentBy = addDaysKey(todayKey, URGENT_DAYS);
  const rows: (CardSection["rows"][number] & { day: string })[] = [];
  for (const d of bundle.deals) {
    if (outcomeOf(bundle, d.stageId) === "lost") continue;
    const stage = bundle.stageLabels[d.stageId]?.trim();
    const owner = d.ownerId ? bundle.owners[d.ownerId] : null;
    for (const [day, what] of [
      [d.bidDate, "Bid due"],
      [d.walkDate, "Job walk"],
    ] as const) {
      if (!day || day < todayKey || day > last) continue;
      rows.push({
        id: `${what}-${d.id}`,
        day,
        href: dealUrl(bundle.hubId, d.id) ?? "/erp/schedule?calendar=management",
        title: d.name,
        note: [`${what} ${dayLabel(day)}, ${inDays(todayKey, day)}`, stage, owner].filter(Boolean).join(" · "),
        value: d.cents ? centsToDollarsCompact(d.cents) : "",
        valueTitle: d.cents ? centsToDollars(d.cents) : undefined,
        negative: day <= urgentBy,
      });
    }
  }
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return {
    key: "due",
    label: "Due soon",
    alertCount: rows.filter((r) => r.day <= urgentBy).length,
    rows: rows.slice(0, SHOWN).map(({ day: _day, ...r }) => r),
    empty: `No bid due dates or job walks in the next ${DUE_WINDOW_DAYS} days. They come from Bid Date and Job Walk Date on HubSpot deals.`,
    href: "/erp/schedule?calendar=management",
    footer: rows.length > SHOWN ? `Soonest ${SHOWN} of ${rows.length}.` : undefined,
  };
}

function staleSection(bundle: Bundle): CardSection {
  const stale = staleQuotes(bundle);
  return {
    key: "stale",
    label: "Stale quotes",
    rows: stale.slice(0, SHOWN).map((s) => ({
      id: s.id,
      href: s.url ?? "/erp/win-loss",
      title: s.name,
      note: `${s.stage}${s.owner ? `, ${s.owner}` : ""}, ${s.daysQuiet} days quiet`,
      value: s.cents ? centsToDollarsCompact(s.cents) : "",
      valueTitle: s.cents ? centsToDollars(s.cents) : undefined,
    })),
    empty: `No quotes quiet for ${STALE_DAYS}+ days.`,
    href: "/erp/win-loss",
    footer: stale.length > SHOWN ? `Biggest ${SHOWN} of ${stale.length}.` : undefined,
  };
}

/** Estimation Queue tab: bid due dates and job walks coming up. */
export async function loadBidsDue(): Promise<DashboardCardData> {
  const section = bidsDueSection(await loadDealBundle(), todayEasternKey());
  return { alertCount: section.alertCount, sections: [section] };
}

/** Sales tab "Bids" card: due soon, and quotes nobody has touched in STALE_DAYS. */
export async function loadSalesBids(): Promise<DashboardCardData> {
  const bundle = await loadDealBundle();
  const due = bidsDueSection(bundle, todayEasternKey());
  return { alertCount: due.alertCount, sections: [due, staleSection(bundle)] };
}

/** Red number on the tab: bids due within URGENT_DAYS. Same for everyone, so it's safe to cache per role. */
export async function countBidsDueAlerts(): Promise<number> {
  return bidsDueSection(await loadDealBundle(), todayEasternKey()).alertCount ?? 0;
}

// ── Price check (Estimation Queue tab) ──────────────────────────────────────

function priceRow(r: PriceCheckRow): CardSection["rows"][number] {
  const pct = Math.round(Math.abs(r.diff) * 100);
  return {
    id: r.id,
    href: r.url ?? "/erp/win-loss",
    title: r.name,
    note: [
      `${r.scopeLabel}: $${r.perSqft.toFixed(2)}/sq ft, usually $${r.benchmark.low.toFixed(2)} to $${r.benchmark.high.toFixed(2)}${r.benchmark.basis === "all bids" ? " (vs all bids)" : ""}`,
      r.stage,
      r.owner,
    ]
      .filter(Boolean)
      .join(" · "),
    value: `${pct}% ${r.diff > 0 ? "above" : "below"}`,
    valueTitle: `${centsToDollars(r.cents)} for ${r.sqft.toLocaleString()} sq ft`,
    negative: true,
  };
}

/** Active open quotes priced outside the usual range for their type of work, plus ones whose numbers look wrong. */
export async function loadPriceCheck(): Promise<DashboardCardData> {
  const { outside, checkNumbers, checked, benchmarks } = await quotePriceCheck();
  const ranges = benchmarks.map((b) => `${b.label} $${b.low.toFixed(2)} to $${b.high.toFixed(2)}`).join(", ");
  return {
    alertCount: outside.length + checkNumbers.length,
    sections: [
      {
        key: "outside",
        label: "Outside usual range",
        alertCount: outside.length,
        rows: outside.slice(0, SHOWN).map(priceRow),
        empty: `All ${checked} active quotes with an amount and sq ft are in the usual range.`,
        href: "/erp/win-loss",
        footer: `Usual range per sq ft: ${ranges}.`,
      },
      {
        key: "numbers",
        label: "Check the numbers",
        alertCount: checkNumbers.length,
        rows: checkNumbers.slice(0, SHOWN).map((r) => ({ ...priceRow(r), note: `${centsToDollars(r.cents)} for ${r.sqft.toLocaleString()} sq ft. Is Area SQFT or the amount right? ${r.stage}${r.owner ? ` · ${r.owner}` : ""}` })),
        empty: "No quotes with numbers that look off.",
        href: "/erp/win-loss",
        footer: "Three times the usual price or more, or a third or less. Usually a wrong Area SQFT or amount in HubSpot.",
      },
    ],
  };
}

export async function countPriceCheckAlerts(): Promise<number> {
  const { outside, checkNumbers } = await quotePriceCheck();
  return outside.length + checkNumbers.length;
}
