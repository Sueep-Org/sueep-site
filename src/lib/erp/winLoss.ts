/**
 * Win/loss for post-construction (DEALS_BILLING_PLAN Phase 5): the Win/Loss
 * page, company scorecards and stale quotes, from postConDeals.ts. Matching
 * GCs to Companies and the math run per request.
 *
 * - Deals are counted by when they were created ("of the bids that came in").
 * - GC: the deal's Company text, matched to a Company by name or other names;
 *   if blank, a Company whose name or other name is in the deal name, else the
 *   last " - " part of the deal name when it looks like a company. Spellings
 *   that match no Company stay separate until someone adds them as other names.
 * - Stale: Quote Sent up to (not including) Quote Approved, no activity for
 *   STALE_DAYS.
 * - Won amounts use the ERP contract value when the job is an ERP project.
 */
import { prisma } from "@/lib/prisma";
import { normalizeCompanyName } from "./clientCompanies";
import { median } from "./stats";
import { isLikelyPriceTypo } from "./quotePriceCheck";
import { loadLostReasonOptions, splitReasons } from "./dealLostReasons";
import { LOSS_GROUPS, type LossGroup, type LossQuarter } from "./lossGroups";
import { WORK_SCOPES, WORK_SCOPE_LABELS, dealUrl, outcomeOf, withErpWonAmounts, type Bundle, type Outcome, type RawDeal, type WorkScope } from "./postConDeals";
import { loadDeals, loadJanitorialDeals } from "./dealEdits";

const DAY_MS = 86_400_000;
export const STALE_DAYS = 30;
const NO_REASON = "No reason given";

// ── Math ──────────────────────────────────────────────────────────────────

export type Stat = { bids: number; won: number; lost: number; open: number; wonCents: number; lostCents: number; winRate: number | null };

function emptyStat(): Stat {
  return { bids: 0, won: 0, lost: 0, open: 0, wonCents: 0, lostCents: 0, winRate: null };
}

function finish(s: Stat): Stat {
  return { ...s, winRate: s.won + s.lost ? s.won / (s.won + s.lost) : null };
}

function addTo(s: Stat, outcome: Outcome, cents: number) {
  s.bids++;
  s[outcome]++;
  if (outcome === "won") s.wonCents += cents;
  if (outcome === "lost") s.lostCents += cents;
}

type CompanyRef = { id: string; name: string; aliases: string[] };

/** Words that mark the end of a deal name as a company name, not an address or unit. */
const GC_WORDS =
  /\b(construction|constructors?|builders?|building|contract(ing|ors?)?|development|developers?|group|homes|inc|llc|co|company|companies|corp|corporation|partners|properties|management|services|enterprises)\b/i;

/** Matches deal company text (or, failing that, the deal name) to a Company. */
export function companyMatcher(companies: CompanyRef[]) {
  const byName = new Map<string, CompanyRef>();
  for (const c of companies)
    for (const n of [c.name, ...c.aliases]) {
      const k = normalizeCompanyName(n);
      if (k) byName.set(k, c);
    }
  // Longest names first, so "HIGH Construction Company" beats "HIGH".
  const inName = [...byName.entries()].filter(([k]) => k.length >= 3).sort((a, b) => b[0].length - a[0].length);
  return (deal: Pick<RawDeal, "company" | "name">): { key: string; label: string; companyId: string | null } | null => {
    if (deal.company) {
      const hit = byName.get(normalizeCompanyName(deal.company));
      if (hit) return { key: `c:${hit.id}`, label: hit.name, companyId: hit.id };
      return { key: `t:${normalizeCompanyName(deal.company)}`, label: deal.company, companyId: null };
    }
    const name = ` ${normalizeCompanyName(deal.name)} `;
    const hit = inName.find(([k]) => name.includes(` ${k} `));
    if (hit) return { key: `c:${hit[1].id}`, label: hit[1].name, companyId: hit[1].id };
    // Deal names often end with the GC: "Ardmore House II - Harkins Builders".
    const tail = deal.name
      .split(/\s+-\s+/)
      .slice(1)
      .pop()
      ?.trim();
    if (tail && GC_WORDS.test(tail)) {
      const k = normalizeCompanyName(tail);
      const byTail = byName.get(k);
      return byTail ? { key: `c:${byTail.id}`, label: byTail.name, companyId: byTail.id } : { key: `t:${k}`, label: tail, companyId: null };
    }
    return null;
  };
}

export const PERIODS = [
  { key: "12m", label: "Last 12 months" },
  { key: "ytd", label: "This year" },
  { key: "all", label: "All time" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

function periodStart(key: PeriodKey, now: Date): number {
  if (key === "12m") return now.getTime() - 365 * DAY_MS;
  if (key === "ytd") return Date.UTC(now.getUTCFullYear(), 0, 1);
  return 0;
}

const SIZE_BUCKETS = [
  { label: "Under $10k", max: 10_000_00 },
  { label: "$10k to $25k", max: 25_000_00 },
  { label: "$25k to $50k", max: 50_000_00 },
  { label: "$50k to $100k", max: 100_000_00 },
  { label: "$100k and up", max: Infinity },
];

/** `note`: a short line under the label, e.g. the GC's price per sq ft. */
export type Row = Stat & { key: string; label: string; href?: string | null; note?: string };

export type ScopeSqft = { scope: WorkScope; label: string; won: number | null; wonSamples: number; wonJobs: number; all: number | null };

export type WinLossReport = {
  period: PeriodKey;
  scope: WorkScope | null;
  byScope: Row[];
  /** Median $ per sq ft per type of work (always all types, for comparing) */
  sqftByScope: ScopeSqft[];
  total: Stat;
  /** General contractors only; unlinked names grouped as "Not linked", deals with no company as "No company" */
  byGc: Row[];
  /** Property managers and owners, from both pipelines (WIN_INSIGHTS_PLAN Phase 2) */
  byClient: ClientRow[];
  /** Company names on deals that match no company, most bids first, for linking */
  unlinked: { name: string; bids: number; won: number; pipeline: "post-con" | "janitorial" }[];
  bySize: Row[];
  lossReasons: { reason: string; count: number; cents: number; share: number }[];
  byQuarter: Row[];
  /** Median $ per sq ft over bids that have both an amount and sq ft. Bids without sq ft are left out of this number only. */
  perSqft: { won: number | null; all: number | null; samples: number; wonSamples: number };
  /** Won deals (any time) whose amount is the ERP contract value instead of HubSpot's Amount */
  wonFromErp: number;
  stale: StaleQuote[];
  /** GC Not Awarded losses in the period and how re-bids with the winning GC went (PIPELINE_PLAN Phase 5) */
  rebids: RebidStats;
  /** Won vs lost $ per sq ft per type of work (WIN_INSIGHTS_PLAN Phase 1) */
  priceDots: PriceDotScope[];
  /** Lost deals per quarter since LOSS_TREND_FROM by main reason, any period (WIN_INSIGHTS_PLAN Phase 4) */
  lossTrend: LossQuarter[];
  fetchedAt: string;
};

/** A property manager or owner: win rate on their deals, plus the work we do for them. */
export type ClientRow = Stat & {
  companyId: string;
  name: string;
  buildings: number;
  contracts: number;
  contractMonthlyCents: number;
  turnovers90: number;
  avgDaysToPay: number | null;
};

const CLIENT_TYPES = new Set(["PROPERTY_MANAGER", "OWNER"]);
const UNLINKED_SHOWN = 15;

/** Reasons were filled in on nearly every lost deal from 2023 on (user decision 2026-10-20). */
const LOSS_TREND_FROM = Date.UTC(2023, 0, 1);

/** A deal with several reasons counts once, under the first named group it has (in LOSS_GROUPS order). */
function lossGroupOf(raw: string | null): LossGroup {
  const rs = splitReasons(raw);
  if (!rs.length) return "none";
  return (LOSS_GROUPS.slice(0, 4).find((g) => rs.includes(g.key))?.key ?? "other") as LossGroup;
}

export type PriceDot = { id: string; name: string; perSqft: number; cents: number; sqft: number; url: string | null };
export type PriceDotRow = { key: "won" | "lost" | "lostPrice"; label: string; dots: PriceDot[]; median: number | null };
/** One type of work: won, lost and lost-for-Price rows, and how many likely typos were left out. */
export type PriceDotScope = { scope: WorkScope; label: string; rows: PriceDotRow[]; excluded: number };

// ── Price per sq ft per GC (WIN_INSIGHTS_PLAN Phase 3) ──────────────────────

const money2 = (v: number) => `$${v.toFixed(2)}`;

/** "Quotes $0.52 (6) · usual win $0.41" under each GC with enough priced bids of that type of work. */
function withPriceNotes(list: Row[], prices: ReturnType<typeof gcPrices>, scope: WorkScope): Row[] {
  return list.map((r) => {
    const p = r.key.startsWith("c:") ? prices.byCompany.get(r.key.slice(2))?.find((x) => x.scope === scope) : undefined;
    if (!p) return r;
    const won = p.won != null ? ` · we win at ${money2(p.won)}` : "";
    return { ...r, note: `${p.label}: quotes ${money2(p.quoted)} (${p.quotedN})${won}${p.usualWon != null ? ` · usual win ${money2(p.usualWon)}` : ""}` };
  });
}

/** A company needs this many priced bids (and wins) of a type of work before its number shows. */
export const GC_PRICE_MIN = 3;

export type GcPrice = { scope: WorkScope; label: string; quoted: number; quotedN: number; won: number | null; wonN: number; usualWon: number | null };

/**
 * Per company and type of work: median quoted $ per sq ft (HubSpot Amount,
 * like the price chart) with GC_PRICE_MIN+ priced bids, their median winning
 * price once they have GC_PRICE_MIN+ wins, and our usual winning price for that
 * type of work across all companies. Likely typos (3 times off the
 * type's middle) are left out.
 */
export function gcPrices(
  bundle: Bundle,
  match: ReturnType<typeof companyMatcher>,
): { byCompany: Map<string, GcPrice[]>; usualWon: Map<WorkScope, number | null> } {
  const byScope = new Map<WorkScope, { d: RawDeal; per: number; won: boolean }[]>();
  for (const d of bundle.deals) {
    if (!d.sqft || !d.cents || d.scope === "UNKNOWN") continue;
    const o = outcomeOf(bundle, d.stageId);
    byScope.set(d.scope, [...(byScope.get(d.scope) ?? []), { d, per: d.cents / 100 / d.sqft, won: o === "won" }]);
  }
  const usualWon = new Map<WorkScope, number | null>();
  const perCompany = new Map<string, Map<WorkScope, { q: number[]; w: number[] }>>();
  for (const [scope, list] of byScope) {
    const mid = median(list.map((x) => x.per))!;
    const kept = list.filter((x) => !isLikelyPriceTypo(x.per, mid));
    usualWon.set(scope, median(kept.filter((x) => x.won).map((x) => x.per)));
    for (const x of kept) {
      const id = match(x.d)?.companyId;
      if (!id) continue;
      const m = perCompany.get(id) ?? new Map();
      const e = m.get(scope) ?? { q: [], w: [] };
      e.q.push(x.per);
      if (x.won) e.w.push(x.per);
      m.set(scope, e);
      perCompany.set(id, m);
    }
  }
  const byCompany = new Map<string, GcPrice[]>();
  for (const [id, m] of perCompany) {
    const rows = WORK_SCOPES.filter((k) => (m.get(k)?.q.length ?? 0) >= GC_PRICE_MIN).map((k) => {
      const e = m.get(k)!;
      return {
        scope: k,
        label: WORK_SCOPE_LABELS[k],
        quoted: median(e.q)!,
        quotedN: e.q.length,
        won: e.w.length >= GC_PRICE_MIN ? median(e.w) : null,
        wonN: e.w.length,
        usualWon: usualWon.get(k) ?? null,
      };
    });
    if (rows.length) byCompany.set(id, rows);
  }
  return { byCompany, usualWon };
}

export type RebidStats = { gcNotAwarded: number; withWinner: number; rebids: number; won: number; lost: number; open: number; wonCents: number };

function rows(map: Map<string, { label: string; href?: string | null; stat: Stat }>): Row[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, href: v.href, ...finish(v.stat) }))
    .sort((a, b) => b.bids - a.bids || a.label.localeCompare(b.label));
}

function bump(
  map: Map<string, { label: string; href?: string | null; stat: Stat }>,
  key: string,
  label: string,
  outcome: Outcome,
  cents: number,
  href?: string | null,
) {
  const e = map.get(key) ?? { label, href, stat: emptyStat() };
  addTo(e.stat, outcome, cents);
  map.set(key, e);
}

export type StaleQuote = { id: string; name: string; stage: string; cents: number; owner: string | null; daysQuiet: number; url: string | null };

/** Bids sitting in a quoting stage with no activity for STALE_DAYS, biggest first. */
export function staleQuotes(bundle: Bundle, now = new Date()): StaleQuote[] {
  return bundle.deals
    .filter((d) => bundle.quoting.includes(d.stageId))
    .map((d) => ({ d, quiet: Math.floor((now.getTime() - Date.parse(d.lastActivity ?? d.created)) / DAY_MS) }))
    .filter((x) => Number.isFinite(x.quiet) && x.quiet >= STALE_DAYS)
    .sort((a, b) => b.d.cents - a.d.cents)
    .map(({ d, quiet }) => ({
      id: d.id,
      name: d.name,
      stage: (bundle.stageLabels[d.stageId] ?? d.stageId).trim(),
      cents: d.cents,
      owner: d.ownerId ? (bundle.owners[d.ownerId] ?? null) : null,
      daysQuiet: quiet,
      url: dealUrl(bundle.hubId, d.id),
    }));
}

/** `scope` limits everything to one type of work. `preloaded` skips the cache, for checks run outside the app. */
/** `preloadedJan` is the janitorial deals, for checks run outside the app like `preloaded`. */
export async function loadWinLoss(
  period: PeriodKey,
  now = new Date(),
  preloaded?: Bundle,
  scope: WorkScope | null = null,
  preloadedJan?: Bundle,
): Promise<WinLossReport> {
  const [bundle, companies, reasonOptions, janBundle] = await Promise.all([
    preloaded ?? loadDeals(),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true, type: true } }),
    // HubSpot's labels for its stored values ("Proyecto en HOLD" is "Did Not Move Forward"). Raw values if HubSpot can't be read.
    loadLostReasonOptions().catch(() => []),
    // Property managers' win rates come mostly from janitorial deals. If HubSpot can't be read, that list is just post-con.
    preloadedJan ?? loadJanitorialDeals().catch(() => null),
  ]);
  const companyType = new Map(companies.map((c) => [c.id, c.type]));
  const unlinkedNames = new Map<string, { name: string; bids: number; won: number; pipeline: "post-con" | "janitorial" }>();
  const reasonLabel = new Map(reasonOptions.map((o) => [o.value, o.label]));
  const { deals, fromErp } = await withErpWonAmounts(bundle);
  const match = companyMatcher(companies);
  const start = periodStart(period, now);
  const total = emptyStat();
  const byGc = new Map(),
    bySize = new Map(),
    byQuarter = new Map(),
    byScope = new Map();
  const scopeSqft = new Map<WorkScope, { won: number[]; all: number[]; wonJobs: number }>(WORK_SCOPES.map((k) => [k, { won: [], all: [], wonJobs: 0 }]));
  const reasons = new Map<string, { count: number; cents: number }>();
  const sqftAll: number[] = [],
    sqftWon: number[] = [];
  const dotsByScope = new Map<WorkScope, { d: RawDeal; outcome: Outcome; per: number }[]>();
  // The price chart compares quotes with quotes: HubSpot's Amount, not the ERP contract value a won job may have grown into.
  const quotedCents = new Map(bundle.deals.map((d) => [d.id, d.cents]));

  for (const d of deals) {
    const created = Date.parse(d.created);
    if (!Number.isFinite(created) || created < start) continue;
    const outcome = outcomeOf(bundle, d.stageId);
    // $ per sq ft by type of work compares all types, so it's counted before the filter.
    const ss = scopeSqft.get(d.scope)!;
    if (outcome === "won") ss.wonJobs++;
    if (d.sqft && d.cents) {
      ss.all.push(d.cents / 100 / d.sqft);
      if (outcome === "won") ss.won.push(d.cents / 100 / d.sqft);
    }
    if (scope && d.scope !== scope) continue;
    addTo(total, outcome, d.cents);
    bump(byScope, d.scope, WORK_SCOPE_LABELS[d.scope], outcome, d.cents);
    const gc = match(d);
    // Property managers and owners get their own list; GC names that match no company are one "Not linked" row here and listed for linking below.
    if (gc?.companyId && CLIENT_TYPES.has(companyType.get(gc.companyId) ?? "")) {
      // counted in byClient
    } else if (gc?.companyId) bump(byGc, gc.key, gc.label, outcome, d.cents, `/erp/companies/${gc.companyId}`);
    else if (gc) {
      bump(byGc, "-unlinked", "Not linked", outcome, d.cents);
      const u = unlinkedNames.get(gc.key) ?? { name: gc.label, bids: 0, won: 0, pipeline: "post-con" as const };
      u.bids++;
      if (outcome === "won") u.won++;
      unlinkedNames.set(gc.key, u);
    } else bump(byGc, "-", "No company", outcome, d.cents);
    const size = SIZE_BUCKETS.findIndex((b) => d.cents < b.max);
    bump(bySize, String(size), d.cents ? SIZE_BUCKETS[size]!.label : "No amount", outcome, d.cents);
    const c = new Date(created);
    const q = `${c.getUTCFullYear()} Q${Math.floor(c.getUTCMonth() / 3) + 1}`;
    bump(byQuarter, q, q, outcome, d.cents);
    if (outcome === "lost") {
      // Several reasons on one deal read "Price, No Answer"; the deal still counts once.
      const r =
        splitReasons(d.lostReason)
          .map((v) => reasonLabel.get(v) ?? v)
          .join(", ") || NO_REASON;
      const e = reasons.get(r) ?? { count: 0, cents: 0 };
      e.count++;
      e.cents += d.cents;
      reasons.set(r, e);
    }
    if (d.sqft && d.cents) {
      const per = d.cents / 100 / d.sqft;
      sqftAll.push(per);
      if (outcome === "won") sqftWon.push(per);
      const quoted = quotedCents.get(d.id) ?? d.cents;
      if (outcome !== "open" && d.scope !== "UNKNOWN" && quoted)
        dotsByScope.set(d.scope, [...(dotsByScope.get(d.scope) ?? []), { d: { ...d, cents: quoted }, outcome, per: quoted / 100 / d.sqft }]);
    }
  }

  const stale = staleQuotes(bundle, now);

  // Re-bids: GC Not Awarded losses that came in during the period, who won them, and how the new deals went.
  const gnaIds = deals
    .filter((d) => outcomeOf(bundle, d.stageId) === "lost" && /gc not awarded/i.test(d.lostReason ?? "") && Date.parse(d.created) >= start)
    .filter((d) => !scope || d.scope === scope)
    .map((d) => d.id);
  const [winnerRows, rebidRows] = gnaIds.length
    ? await Promise.all([
        prisma.dealLostWinner.findMany({ where: { hubspotDealId: { in: gnaIds } }, select: { hubspotDealId: true } }),
        prisma.dealRebid.findMany({ where: { fromDealId: { in: gnaIds } }, select: { newDealId: true } }),
      ])
    : [[], []];
  const byId = new Map(deals.map((d) => [d.id, d]));
  const rebids: RebidStats = { gcNotAwarded: gnaIds.length, withWinner: winnerRows.length, rebids: rebidRows.length, won: 0, lost: 0, open: 0, wonCents: 0 };
  for (const r of rebidRows) {
    const d = byId.get(r.newDealId);
    // A brand new deal isn't in the hour-old HubSpot read yet; it's open.
    const o = d ? outcomeOf(bundle, d.stageId) : "open";
    rebids[o]++;
    if (o === "won" && d) rebids.wonCents += d.cents;
  }

  const lost = total.lost || 1;
  return {
    period,
    scope,
    byScope: WORK_SCOPES.map((k) => rows(byScope).find((r) => r.key === k)).filter((r): r is Row => !!r),
    sqftByScope: WORK_SCOPES.map((k) => {
      const v = scopeSqft.get(k)!;
      return { scope: k, label: WORK_SCOPE_LABELS[k], won: median(v.won), wonSamples: v.won.length, wonJobs: v.wonJobs, all: median(v.all) };
    }),
    total: finish(total),
    byGc: withPriceNotes(rows(byGc), gcPrices(bundle, match), scope ?? "CLEANING"),
    byClient: await clientRows(start, deals, bundle, janBundle, companies, match, unlinkedNames, now),
    unlinked: [...unlinkedNames.values()].sort((a, b) => b.bids - a.bids || b.won - a.won).slice(0, UNLINKED_SHOWN),
    bySize: rows(bySize).sort((a, b) => Number(a.key) - Number(b.key)),
    lossReasons: [...reasons.entries()].map(([reason, v]) => ({ reason, ...v, share: v.count / lost })).sort((a, b) => b.count - a.count),
    byQuarter: rows(byQuarter).sort((a, b) => a.key.localeCompare(b.key)),
    perSqft: { won: median(sqftWon), all: median(sqftAll), samples: sqftAll.length, wonSamples: sqftWon.length },
    wonFromErp: fromErp,
    stale,
    rebids,
    lossTrend: (() => {
      const q = new Map<string, LossQuarter>();
      for (const d of deals) {
        const created = Date.parse(d.created);
        if (!Number.isFinite(created) || created < LOSS_TREND_FROM || outcomeOf(bundle, d.stageId) !== "lost" || (scope && d.scope !== scope)) continue;
        const c = new Date(created);
        const key = `${c.getUTCFullYear()} Q${Math.floor(c.getUTCMonth() / 3) + 1}`;
        const e = q.get(key) ?? { key, total: 0, parts: Object.fromEntries(LOSS_GROUPS.map((g) => [g.key, 0])) as Record<LossGroup, number> };
        e.total++;
        e.parts[lossGroupOf(d.lostReason)]++;
        q.set(key, e);
      }
      // Every quarter from the start to today, so a quarter with no losses shows as empty instead of missing.
      const out: LossQuarter[] = [];
      for (
        let y = 2023, qn = 1;
        y < now.getUTCFullYear() || (y === now.getUTCFullYear() && qn <= Math.floor(now.getUTCMonth() / 3) + 1);
        qn === 4 ? (y++, (qn = 1)) : qn++
      ) {
        const key = `${y} Q${qn}`;
        out.push(q.get(key) ?? { key, total: 0, parts: Object.fromEntries(LOSS_GROUPS.map((g) => [g.key, 0])) as Record<LossGroup, number> });
      }
      return out;
    })(),
    priceDots: WORK_SCOPES.filter((k) => dotsByScope.has(k)).map((k) => {
      const all = dotsByScope.get(k)!;
      const mid = median(all.map((x) => x.per))!;
      const kept = all.filter((x) => !isLikelyPriceTypo(x.per, mid));
      const dot = (x: (typeof all)[number]): PriceDot => ({
        id: x.d.id,
        name: x.d.name,
        perSqft: x.per,
        cents: x.d.cents,
        sqft: x.d.sqft!,
        url: dealUrl(bundle.hubId, x.d.id),
      });
      const row = (key: PriceDotRow["key"], label: string, xs: typeof all): PriceDotRow => ({
        key,
        label,
        dots: xs.map(dot),
        median: median(xs.map((x) => x.per)),
      });
      const lost = kept.filter((x) => x.outcome === "lost");
      return {
        scope: k,
        label: WORK_SCOPE_LABELS[k],
        rows: [
          row(
            "won",
            "Won",
            kept.filter((x) => x.outcome === "won"),
          ),
          row("lost", "Lost", lost),
          row(
            "lostPrice",
            "Lost for Price",
            lost.filter((x) => splitReasons(x.d.lostReason).includes("Price")),
          ),
        ],
        excluded: all.length - kept.length,
      };
    }),
    fetchedAt: bundle.fetchedAt,
  };
}

// ── GC scorecard (company page) ─────────────────────────────────────────────

export type GcScorecard = Stat & {
  gcNotAwarded: number;
  perSqftQuoted: number | null;
  perSqftWon: number | null;
  /** Won $ per sq ft per type of work, only types with won jobs that have sq ft */
  perSqftWonByScope: { label: string; value: number; samples: number }[];
  /** What we quote them per type of work, against what we win at with them and our usual win (WIN_INSIGHTS_PLAN Phase 3) */
  prices: GcPrice[];
  avgDaysToPay: number | null;
  paidInvoices: number;
  recent: { id: string; name: string; outcome: Outcome; cents: number; created: string; url: string | null }[];
};

/**
 * Property managers and owners: win rate over their deals in both pipelines
 * created in the period, plus buildings, active janitorial contracts,
 * turnovers finished in the last 90 days and average days to pay. Janitorial
 * company names that match no company are added to `unlinked`.
 */
async function clientRows(
  start: number,
  postCon: RawDeal[],
  pcBundle: Bundle,
  janBundle: Bundle | null,
  companies: { id: string; name: string; type: string }[],
  match: ReturnType<typeof companyMatcher>,
  unlinked: Map<string, { name: string; bids: number; won: number; pipeline: "post-con" | "janitorial" }>,
  now: Date,
): Promise<ClientRow[]> {
  const clients = companies.filter((c) => CLIENT_TYPES.has(c.type));
  if (!clients.length) return [];
  const stat = new Map<string, Stat>(clients.map((c) => [c.id, emptyStat()]));
  const count = (b: Bundle, d: RawDeal, pipeline: "post-con" | "janitorial") => {
    if (Date.parse(d.created) < start) return;
    const g = match(d);
    const e = g?.companyId ? stat.get(g.companyId) : undefined;
    if (e) addTo(e, outcomeOf(b, d.stageId), d.cents);
    else if (g && !g.companyId && pipeline === "janitorial") {
      const u = unlinked.get(g.key) ?? { name: g.label, bids: 0, won: 0, pipeline };
      u.bids++;
      if (outcomeOf(b, d.stageId) === "won") u.won++;
      unlinked.set(g.key, u);
    }
  };
  for (const d of postCon) count(pcBundle, d, "post-con");
  for (const d of janBundle?.deals ?? []) count(janBundle!, d, "janitorial");

  const ids = clients.map((c) => c.id);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const [buildings, contracts, turnovers, pays] = await Promise.all([
    prisma.building.groupBy({ by: ["managedByCompanyId"], where: { managedByCompanyId: { in: ids } }, _count: { _all: true } }),
    prisma.recurringContract.findMany({
      where: { status: "ACTIVE", building: { managedByCompanyId: { in: ids } } },
      select: { monthlyRateCents: true, building: { select: { managedByCompanyId: true } } },
    }),
    prisma.project.findMany({
      where: { segment: "JANITORIAL_TURNOVER_REQUESTS", turnoverCompletedAt: { gte: since90 }, building: { managedByCompanyId: { in: ids } } },
      select: { building: { select: { managedByCompanyId: true } } },
    }),
    Promise.all(ids.map((id) => daysToPay(id))),
  ]);
  return clients
    .map((c, i) => {
      const mine = contracts.filter((x) => x.building.managedByCompanyId === c.id);
      return {
        ...finish(stat.get(c.id)!),
        companyId: c.id,
        name: c.name,
        buildings: buildings.find((b) => b.managedByCompanyId === c.id)?._count._all ?? 0,
        contracts: mine.length,
        contractMonthlyCents: mine.reduce((sum, x) => sum + x.monthlyRateCents, 0),
        turnovers90: turnovers.filter((t) => t.building?.managedByCompanyId === c.id).length,
        avgDaysToPay: pays[i]!.avg,
      };
    })
    .sort((a, b) => b.contractMonthlyCents - a.contractMonthlyCents || b.bids - a.bids || a.name.localeCompare(b.name));
}

/** Average days from invoice to payment, over paid invoices on this company's jobs and buildings. */
async function daysToPay(companyId: string): Promise<{ avg: number | null; n: number }> {
  const buildingIds = (await prisma.building.findMany({ where: { managedByCompanyId: companyId }, select: { id: true } })).map((b) => b.id);
  const projectWhere = { OR: [{ clientCompanyId: companyId }, { clientCompanyId: null, buildingId: { in: buildingIds } }] };
  const pick = { hubspotInvoiceId: true, invoiceDate: true, paidDate: true } as const;
  const paid = { status: "paid", invoiceDate: { not: null }, paidDate: { not: null } };
  const [sov, units, months] = await Promise.all([
    prisma.hubSpotSovInvoice.findMany({ where: { ...paid, project: projectWhere }, select: pick }),
    prisma.hubSpotUnitInvoice.findMany({ where: { ...paid, buildingId: { in: buildingIds } }, select: pick }),
    prisma.hubSpotContractInvoice.findMany({ where: { ...paid, period: { recurringContract: { buildingId: { in: buildingIds } } } }, select: pick }),
  ]);
  const byInvoice = new Map<string, number>();
  for (const r of [...sov, ...units, ...months]) byInvoice.set(r.hubspotInvoiceId, (r.paidDate!.getTime() - r.invoiceDate!.getTime()) / DAY_MS);
  const days = [...byInvoice.values()].filter((d) => d >= 0);
  return { avg: days.length ? days.reduce((s, d) => s + d, 0) / days.length : null, n: days.length };
}

export async function loadGcScorecard(companyId: string, preloaded?: Bundle): Promise<GcScorecard | null> {
  const [bundle, companies, pay] = await Promise.all([
    preloaded ?? loadDeals(),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }),
    daysToPay(companyId),
  ]);
  const match = companyMatcher(companies);
  const deals = (await withErpWonAmounts(bundle)).deals.filter((d) => match(d)?.companyId === companyId);
  if (!deals.length && pay.n === 0) return null;
  const s = emptyStat();
  let gcNotAwarded = 0;
  const all: number[] = [],
    won: number[] = [];
  const wonByScope = new Map<WorkScope, number[]>();
  for (const d of deals) {
    const o = outcomeOf(bundle, d.stageId);
    addTo(s, o, d.cents);
    if (o === "lost" && /gc not awarded/i.test(d.lostReason ?? "")) gcNotAwarded++;
    if (d.sqft && d.cents) {
      all.push(d.cents / 100 / d.sqft);
      if (o === "won") {
        won.push(d.cents / 100 / d.sqft);
        wonByScope.set(d.scope, [...(wonByScope.get(d.scope) ?? []), d.cents / 100 / d.sqft]);
      }
    }
  }
  return {
    ...finish(s),
    gcNotAwarded,
    perSqftQuoted: median(all),
    perSqftWon: median(won),
    prices: gcPrices(bundle, match).byCompany.get(companyId) ?? [],
    perSqftWonByScope: WORK_SCOPES.filter((k) => wonByScope.has(k)).map((k) => ({
      label: WORK_SCOPE_LABELS[k],
      value: median(wonByScope.get(k)!)!,
      samples: wonByScope.get(k)!.length,
    })),
    avgDaysToPay: pay.avg,
    paidInvoices: pay.n,
    recent: [...deals]
      .sort((a, b) => b.created.localeCompare(a.created))
      .slice(0, 8)
      .map((d) => ({ id: d.id, name: d.name, outcome: outcomeOf(bundle, d.stageId), cents: d.cents, created: d.created, url: dealUrl(bundle.hubId, d.id) })),
  };
}
