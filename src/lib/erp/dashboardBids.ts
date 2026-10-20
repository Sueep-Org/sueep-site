/**
 * Dashboard cards about post-construction bids, from HubSpot (postConDeals.ts):
 * Bids due (Estimation Queue), the Sales tab's Bids card (Due soon, Stale
 * quotes) and Price check (Estimation Queue). Bids due and Bids also have a
 * Follow-ups tab with pipeline next steps (dealFollowUps.ts).
 */
import { cache } from "react";
import type { CardSection, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { STALE_DAYS, staleQuotes } from "./winLoss";
import { dealUrl, loadDealBundle, loadJanitorialDealBundle, outcomeOf, type Bundle, type RawDeal } from "./postConDeals";
import { openNextSteps } from "./dealFollowUps";
import { loadWinBands, type WinBand } from "./winChance";
import { loadPipelineBoard } from "./pipelineBoard";
import type { CardContext } from "./dashboardCardLoaders";
import { quotePriceCheck, type PriceCheckRow } from "./quotePriceCheck";

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
/** `bandOf` adds the chance to win to each row (left out for the tab count, which doesn't need it). */
function bidsDueSection(bundle: Bundle, todayKey: string, bandOf?: (d: RawDeal) => WinBand | null): CardSection {
  const last = addDaysKey(todayKey, DUE_WINDOW_DAYS);
  const urgentBy = addDaysKey(todayKey, URGENT_DAYS);
  const rows: (CardSection["rows"][number] & { day: string; dealId: string })[] = [];
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
        dealId: d.id,
        id: `${what}-${d.id}`,
        day,
        href: dealUrl(bundle.hubId, d.id) ?? "/erp/schedule?calendar=management",
        title: d.name,
        note: [bandOf?.(d) ? `${bandOf(d)} chance` : null, `${what} ${dayLabel(day)}, ${inDays(todayKey, day)}`, stage, owner].filter(Boolean).join(" · "),
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
    // A deal with both a bid due and a job walk this soon counts once.
    alertCount: new Set(rows.filter((r) => r.day <= urgentBy).map((r) => r.dealId)).size,
    rows: rows.slice(0, SHOWN).map(({ day: _day, dealId: _dealId, ...r }) => r),
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

/**
 * Pipeline next steps overdue or due this week, both pipelines, overdue
 * first. Sales and Estimation see their own deals (HubSpot owner email
 * matched to their login); Admin and PM level see everyone's.
 */
async function followUpSection(ctx: CardContext, todayKey: string): Promise<CardSection> {
  const [steps, pc, jan] = await Promise.all([openNextSteps(), loadDealBundle(), loadJanitorialDealBundle()]);
  const mineOnly = ctx.role === "SALES" || ctx.role === "ESTIMATION";
  const me = ctx.email.toLowerCase();
  const weekEnd = addDaysKey(todayKey, 6);
  const rows: (CardSection["rows"][number] & { due: string })[] = [];
  for (const [bundle, board] of [
    [pc, "/erp/pipeline"],
    [jan, "/erp/pipeline?pipeline=janitorial"],
  ] as const) {
    for (const d of bundle.deals) {
      const step = steps.get(d.id);
      if (!step || step.dueDate > weekEnd || outcomeOf(bundle, d.stageId) !== "open") continue;
      if (mineOnly && (!d.ownerId || bundle.ownerEmails[d.ownerId] !== me)) continue;
      const overdue = step.dueDate < todayKey;
      rows.push({
        id: `fu-${d.id}`,
        due: step.dueDate,
        href: board,
        title: d.name,
        note: [
          `${step.text}, ${overdue ? "was due" : "due"} ${dayLabel(step.dueDate)}`,
          bundle.stageLabels[d.stageId]?.trim(),
          mineOnly ? null : d.ownerId ? bundle.owners[d.ownerId] : null,
        ]
          .filter(Boolean)
          .join(" · "),
        value: d.cents ? centsToDollarsCompact(d.cents) : "",
        valueTitle: d.cents ? centsToDollars(d.cents) : undefined,
        negative: overdue,
      });
    }
  }
  rows.sort((a, b) => a.due.localeCompare(b.due));
  return {
    key: "follow-ups",
    label: "Follow-ups",
    alertCount: rows.filter((r) => r.due < todayKey).length,
    rows: rows.slice(0, SHOWN).map(({ due: _due, ...r }) => r),
    empty: mineOnly ? "No next steps on your deals overdue or due this week." : "No next steps overdue or due this week.",
    href: "/erp/pipeline",
    footer: rows.length > SHOWN ? `Soonest ${SHOWN} of ${rows.length}.` : undefined,
  };
}

/** Estimation Queue tab: bid due dates and job walks coming up, and next steps. */
export async function loadBidsDue(ctx: CardContext): Promise<DashboardCardData> {
  const today = todayEasternKey();
  const bundle = await loadDealBundle();
  const [bands, followUps] = await Promise.all([loadWinBands(bundle), followUpSection(ctx, today)]);
  const section = bidsDueSection(bundle, today, bands);
  return { alertCount: section.alertCount, sections: [section, followUps] };
}

/** Sales tab "Bids" card: due soon, quotes nobody has touched in STALE_DAYS, and next steps. */
export async function loadSalesBids(ctx: CardContext): Promise<DashboardCardData> {
  const bundle = await loadDealBundle();
  const today = todayEasternKey();
  const due = bidsDueSection(bundle, today, await loadWinBands(bundle));
  return { alertCount: due.alertCount, sections: [due, staleSection(bundle), await followUpSection(ctx, today)] };
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

/** One price check per request: the card and its tab count share it. */
const priceCheckOnce = cache(() => quotePriceCheck());

/** Active open quotes priced outside the usual range for their type of work, plus ones whose numbers look wrong. */
export async function loadPriceCheck(): Promise<DashboardCardData> {
  const { outside, checkNumbers, checked, benchmarks } = await priceCheckOnce();
  const ranges = benchmarks.map((b) => `${b.label} $${b.low.toFixed(2)} to $${b.high.toFixed(2)}`).join(", ");
  return {
    alertCount: outside.length + checkNumbers.length,
    sections: [
      {
        key: "outside",
        label: "Outside usual range",
        alertCount: outside.length,
        rows: outside.slice(0, SHOWN).map(priceRow),
        empty: !benchmarks.length
          ? "Not enough won jobs or bids with Area SQFT to compare against yet."
          : checked
            ? `All ${checked} active quotes with an amount and sq ft are in the usual range.`
            : "No quotes touched in the last 30 days have both an amount and Area SQFT.",
        href: "/erp/win-loss",
        footer: benchmarks.length ? `Usual range per sq ft: ${ranges}.` : undefined,
      },
      {
        key: "numbers",
        label: "Check the numbers",
        alertCount: checkNumbers.length,
        rows: checkNumbers.slice(0, SHOWN).map((r) => ({
          ...priceRow(r),
          note: `${centsToDollars(r.cents)} for ${r.sqft.toLocaleString()} sq ft. Is Area SQFT or the amount right? ${r.stage}${r.owner ? ` · ${r.owner}` : ""}`,
        })),
        empty: "No quotes with numbers that look off.",
        href: "/erp/win-loss",
        footer: "Three times the usual price or more, or a third or less. Usually a wrong Area SQFT or amount in HubSpot.",
      },
    ],
  };
}

export async function countPriceCheckAlerts(): Promise<number> {
  const { outside, checkNumbers } = await priceCheckOnce();
  return outside.length + checkNumbers.length;
}

// ── Pipeline this week (Business Manager, Sales tab) ────────────────────────

/** This week's changes on both pipelines and the post-con forecast, from the same numbers as the board's strip. */
export async function loadPipelineWeek(): Promise<DashboardCardData> {
  const [pc, jan] = await Promise.all([loadPipelineBoard("post-con", "recent", null), loadPipelineBoard("janitorial", "recent", null)]);
  const rows: CardSection["rows"] = [];
  for (const [label, b, href] of [
    ["Post-construction", pc, "/erp/pipeline"],
    ["Janitorial", jan, "/erp/pipeline?pipeline=janitorial"],
  ] as const) {
    const w = b.weekly;
    rows.push({
      id: `week-${label}`,
      href,
      title: label,
      note: w
        ? `${w.newDeals} new, ${w.movedForward} moved forward, ${w.won} won, ${w.lost} closed lost since ${dayLabel(w.sinceDay)}`
        : "Starts after the first daily snapshot",
      value: w?.newCents ? `${centsToDollarsCompact(w.newCents)} new` : "",
    });
  }
  if (pc.forecast) {
    rows.push({
      id: "forecast",
      href: "/erp/pipeline",
      title: "Forecast (post-construction)",
      note: `${pc.forecast.deals} open deals times their chance to win. Won from bids in the last 12 months: ${centsToDollarsCompact(pc.forecast.wonLast12Cents)}`,
      value: centsToDollarsCompact(pc.forecast.cents),
      valueTitle: centsToDollars(pc.forecast.cents),
    });
  }
  return { sections: [{ key: "week", label: "This week", rows, empty: "Nothing yet.", href: "/erp/pipeline" }] };
}
