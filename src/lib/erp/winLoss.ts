/**
 * Win/loss for post-construction (DEALS_BILLING_PLAN Phase 5), read live
 * from HubSpot because the ERP deletes lost deals on sync. The deals are
 * cached for an hour; matching GCs to Companies and the math run per request.
 *
 * - Won: Quote Approved or any later stage (same rule as the dashboard's Wins
 *   tab, dashboardWins.ts). Lost: Deal Lost. Everything else is open.
 * - Deals are counted by when they were created ("of the bids that came in").
 * - GC: the deal's Company text, matched to a Company by name or other names;
 *   if blank, a Company whose name or other name is in the deal name. Spellings
 *   that match no Company stay separate until someone adds them as other names.
 * - Stale: Quote Sent up to (not including) Quote Approved, no activity for
 *   STALE_DAYS.
 * - Type of work: from the deal's line items (copied from its quote): painting
 *   words, cleaning words, or both. No line items: HubSpot's Type of business.
 *   Neither: unknown, kept as its own group.
 * - Amounts: a won deal that is an ERP project uses the project's contract
 *   value (what we bill from); HubSpot's Amount is often stale on those.
 *   Everything else uses HubSpot's Amount.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules } from "./dashboardWins";
import { normalizeCompanyName } from "./clientCompanies";

const CACHE_SECONDS = 3600;
const DAY_MS = 86_400_000;
export const STALE_DAYS = 30;
const NO_REASON = "No reason given";

export type RawDeal = {
  id: string;
  name: string;
  stageId: string;
  cents: number;
  created: string;
  ownerId: string | null;
  company: string | null;
  lostReason: string | null;
  source: string | null;
  sqft: number | null;
  lastActivity: string | null;
  scope: WorkScope;
  /** HubSpot Bid Date and Job Walk Date ("YYYY-MM-DD"), for the Management calendar's Bids category */
  bidDate: string | null;
  walkDate: string | null;
};

export const WORK_SCOPES = ["CLEANING", "PAINTING", "BOTH", "UNKNOWN"] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];
export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  CLEANING: "Cleaning",
  PAINTING: "Painting",
  BOTH: "Cleaning + painting",
  UNKNOWN: "Not known",
};

const PAINT_WORDS = /\b(paint\w*|primer|prime|coats?|stain\w*|drywall|caulk\w*)\b/i;
const CLEAN_WORDS = /\b(clean\w*|wash\w*|rough|final|windows?|janitor\w*|sweep\w*|debris|scrub\w*|mop\w*|pressure)\b/i;

/** Painting, cleaning or both, from line item text; null when the text says neither. */
export function scopeFromText(text: string): WorkScope | null {
  const p = PAINT_WORDS.test(text), c = CLEAN_WORDS.test(text);
  return p && c ? "BOTH" : p ? "PAINTING" : c ? "CLEANING" : null;
}

/** HubSpot's Type of business values, for deals without line items. */
function scopeFromTypeOfBusiness(v: string | null): WorkScope | null {
  if (!v) return null;
  if (/\+|cleaning and painting/i.test(v)) return "BOTH";
  return /paint/i.test(v) ? "PAINTING" : /clean/i.test(v) ? "CLEANING" : null;
}

export type Bundle = {
  deals: RawDeal[];
  won: string[];
  lost: string[];
  /** Quote Sent through the last stage before won */
  quoting: string[];
  stageLabels: Record<string, string>;
  owners: Record<string, string>;
  hubId: string | null;
  fetchedAt: string;
};

const PROPS = ["dealname", "dealstage", "amount", "createdate", "hubspot_owner_id", "company", "deal_lost_reason", "how_the_customer_reach_sueep", "area_sqft", "notes_last_updated", "hs_lastmodifieddate", "type_of_business", "bid_date", "completion_date"];

async function searchAll(pipelineId: string): Promise<RawDeal[]> {
  const out: RawDeal[] = [];
  let after: string | undefined;
  for (let page = 0; page < 60; page++) {
    const res = await hubspotFetch("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }] }],
        properties: PROPS,
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status}`);
    const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    for (const d of data.results ?? []) {
      const p = d.properties;
      const sqft = Number(p.area_sqft);
      out.push({
        id: d.id,
        name: p.dealname ?? "(no name)",
        stageId: p.dealstage ?? "",
        cents: Math.round(Number(p.amount ?? 0) * 100) || 0,
        created: p.createdate ?? "",
        ownerId: p.hubspot_owner_id ?? null,
        company: p.company?.trim() || null,
        lostReason: p.deal_lost_reason?.trim() || null,
        source: p.how_the_customer_reach_sueep?.trim() || null,
        sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : null,
        lastActivity: p.notes_last_updated ?? p.hs_lastmodifieddate ?? null,
        // Filled in from line items in computeBundle; Type of business is the fallback.
        scope: scopeFromTypeOfBusiness(p.type_of_business ?? null) ?? "UNKNOWN",
        bidDate: p.bid_date?.slice(0, 10) || null,
        // HubSpot's "Job Walk Date" lives in a property named completion_date.
        walkDate: p.completion_date?.slice(0, 10) || null,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

/** Every deal's line item text, in a few batch calls (associations, then the items). */
async function loadLineItemText(dealIds: string[]): Promise<Map<string, string>> {
  const itemsByDeal = new Map<string, string[]>();
  for (let i = 0; i < dealIds.length; i += 500) {
    const res = await hubspotFetch("/crm/v4/associations/deals/line_items/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: dealIds.slice(i, i + 500).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot line item links failed: ${res.status}`);
    const data = (await res.json()) as { results?: { from: { id: string }; to: { toObjectId: number | string }[] }[] };
    for (const r of data.results ?? []) itemsByDeal.set(String(r.from.id), r.to.map((t) => String(t.toObjectId)));
  }
  const allItems = [...new Set([...itemsByDeal.values()].flat())];
  const textByItem = new Map<string, string>();
  for (let i = 0; i < allItems.length; i += 100) {
    const res = await hubspotFetch("/crm/v3/objects/line_items/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: ["name", "description"], inputs: allItems.slice(i, i + 100).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot line items failed: ${res.status}`);
    const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] };
    for (const li of data.results ?? []) textByItem.set(li.id, `${li.properties.name ?? ""} ${li.properties.description ?? ""}`);
  }
  return new Map([...itemsByDeal].map(([deal, items]) => [deal, items.map((id) => textByItem.get(id) ?? "").join(" | ")]));
}

async function loadOwners(): Promise<Record<string, string>> {
  const owners: Record<string, string> = {};
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await hubspotFetch(`/crm/v3/owners?limit=100${after ? `&after=${after}` : ""}`);
    if (!res.ok) break;
    const data = (await res.json()) as { results?: { id: string; firstName?: string; lastName?: string; email?: string }[]; paging?: { next?: { after?: string } } };
    for (const o of data.results ?? []) owners[o.id] = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || o.email || o.id;
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return owners;
}

/** Our HubSpot account id, for links to deals. */
async function loadHubId(): Promise<string | null> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch("https://api.hubapi.com/oauth/v2/private-apps/get/access-token-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenKey: token }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { hubId?: number };
  return data.hubId ? String(data.hubId) : null;
}

export async function computeBundle(): Promise<Bundle> {
  const rules = (await loadRules()).find((r) => r.key === "post-con");
  if (!rules) throw new Error("Post-construction pipeline not found");
  const res = await hubspotFetch("/crm/v3/pipelines/deals");
  const pipes = (await res.json()) as { results?: { id: string; stages?: { id: string; label: string; displayOrder: number }[] }[] };
  const stages = (pipes.results ?? []).find((p) => p.id === rules.pipelineId)?.stages ?? [];
  const firstWon = Math.min(...stages.filter((s) => rules.won.has(s.id)).map((s) => s.displayOrder));
  const quoteStart = stages.find((s) => s.id === rules.quoteStageId)?.displayOrder ?? stages.find((s) => /quote sent/i.test(s.label))?.displayOrder ?? firstWon;
  const quoting = stages.filter((s) => s.displayOrder >= quoteStart && s.displayOrder < firstWon && !rules.lost.has(s.id)).map((s) => s.id);
  const [found, owners, hubId] = await Promise.all([searchAll(rules.pipelineId), loadOwners(), loadHubId()]);
  const lineText = await loadLineItemText(found.map((d) => d.id));
  const deals = found.map((d) => ({ ...d, scope: scopeFromText(lineText.get(d.id) ?? "") ?? d.scope }));
  return {
    deals,
    won: [...rules.won],
    lost: [...rules.lost],
    quoting,
    stageLabels: Object.fromEntries(stages.map((s) => [s.id, s.label])),
    owners,
    hubId,
    fetchedAt: new Date().toISOString(),
  };
}

/** Cached an hour. Errors aren't cached, so the next visit tries again. */
export const loadDealBundle = unstable_cache(computeBundle, ["win-loss-deals-v3"], { revalidate: CACHE_SECONDS });

export function dealUrl(hubId: string | null, dealId: string): string | null {
  return hubId ? `https://app.hubspot.com/contacts/${hubId}/record/0-3/${dealId}` : null;
}

// ── Math ──────────────────────────────────────────────────────────────────

export type Outcome = "won" | "lost" | "open";

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
const GC_WORDS = /\b(construction|constructors?|builders?|building|contract(ing|ors?)?|development|developers?|group|homes|inc|llc|co|company|companies|corp|corporation|partners|properties|management|services|enterprises)\b/i;

/** Matches deal company text (or, failing that, the deal name) to a Company. */
export function companyMatcher(companies: CompanyRef[]) {
  const byName = new Map<string, CompanyRef>();
  for (const c of companies) for (const n of [c.name, ...c.aliases]) {
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
    const tail = deal.name.split(/\s+-\s+/).slice(1).pop()?.trim();
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

export type Row = Stat & { key: string; label: string; href?: string | null };

export type ScopeSqft = { scope: WorkScope; label: string; won: number | null; wonSamples: number; wonJobs: number; all: number | null };

export type WinLossReport = {
  period: PeriodKey;
  scope: WorkScope | null;
  byScope: Row[];
  /** Median $ per sq ft per type of work (always all types, for comparing) */
  sqftByScope: ScopeSqft[];
  total: Stat;
  byGc: Row[];
  bySize: Row[];
  lossReasons: { reason: string; count: number; cents: number; share: number }[];
  byQuarter: Row[];
  /** Median $ per sq ft over bids that have both an amount and sq ft. Bids without sq ft are left out of this number only. */
  perSqft: { won: number | null; all: number | null; samples: number; wonSamples: number };
  /** Won deals (any time) whose amount is the ERP contract value instead of HubSpot's Amount */
  wonFromErp: number;
  stale: StaleQuote[];
  fetchedAt: string;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function rows(map: Map<string, { label: string; href?: string | null; stat: Stat }>): Row[] {
  return [...map.entries()].map(([key, v]) => ({ key, label: v.label, href: v.href, ...finish(v.stat) })).sort((a, b) => b.bids - a.bids || a.label.localeCompare(b.label));
}

function bump(map: Map<string, { label: string; href?: string | null; stat: Stat }>, key: string, label: string, outcome: Outcome, cents: number, href?: string | null) {
  const e = map.get(key) ?? { label, href, stat: emptyStat() };
  addTo(e.stat, outcome, cents);
  map.set(key, e);
}

/**
 * Won deals that are ERP projects get the project's contract value instead
 * of HubSpot's Amount. Returns the adjusted deals and how many were swapped.
 */
async function withErpWonAmounts(bundle: Bundle): Promise<{ deals: RawDeal[]; fromErp: number }> {
  const wonIds = bundle.deals.filter((d) => bundle.won.includes(d.stageId)).map((d) => d.id);
  const projects = wonIds.length
    ? await prisma.project.findMany({ where: { hubspotDealId: { in: wonIds }, contractValueCents: { not: null } }, select: { hubspotDealId: true, contractValueCents: true } })
    : [];
  const erp = new Map(projects.map((p) => [p.hubspotDealId!, p.contractValueCents!]));
  return { deals: bundle.deals.map((d) => (erp.has(d.id) ? { ...d, cents: erp.get(d.id)! } : d)), fromErp: erp.size };
}

export function outcomeOf(b: Pick<Bundle, "won" | "lost">, stageId: string): Outcome {
  return b.won.includes(stageId) ? "won" : b.lost.includes(stageId) ? "lost" : "open";
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
export async function loadWinLoss(period: PeriodKey, now = new Date(), preloaded?: Bundle, scope: WorkScope | null = null): Promise<WinLossReport> {
  const [bundle, companies] = await Promise.all([
    preloaded ?? loadDealBundle(),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }),
  ]);
  const { deals, fromErp } = await withErpWonAmounts(bundle);
  const match = companyMatcher(companies);
  const start = periodStart(period, now);
  const total = emptyStat();
  const byGc = new Map(), bySize = new Map(), byQuarter = new Map(), byScope = new Map();
  const scopeSqft = new Map<WorkScope, { won: number[]; all: number[]; wonJobs: number }>(WORK_SCOPES.map((k) => [k, { won: [], all: [], wonJobs: 0 }]));
  const reasons = new Map<string, { count: number; cents: number }>();
  const sqftAll: number[] = [], sqftWon: number[] = [];

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
    bump(byGc, gc?.key ?? "-", gc?.label ?? "No company", outcome, d.cents, gc?.companyId ? `/erp/companies/${gc.companyId}` : null);
    const size = SIZE_BUCKETS.findIndex((b) => d.cents < b.max);
    bump(bySize, String(size), d.cents ? SIZE_BUCKETS[size]!.label : "No amount", outcome, d.cents);
    const c = new Date(created);
    const q = `${c.getUTCFullYear()} Q${Math.floor(c.getUTCMonth() / 3) + 1}`;
    bump(byQuarter, q, q, outcome, d.cents);
    if (outcome === "lost") {
      const r = d.lostReason ?? NO_REASON;
      const e = reasons.get(r) ?? { count: 0, cents: 0 };
      e.count++;
      e.cents += d.cents;
      reasons.set(r, e);
    }
    if (d.sqft && d.cents) {
      const per = d.cents / 100 / d.sqft;
      sqftAll.push(per);
      if (outcome === "won") sqftWon.push(per);
    }
  }

  const stale = staleQuotes(bundle, now);

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
    byGc: rows(byGc),
    bySize: rows(bySize).sort((a, b) => Number(a.key) - Number(b.key)),
    lossReasons: [...reasons.entries()].map(([reason, v]) => ({ reason, ...v, share: v.count / lost })).sort((a, b) => b.count - a.count),
    byQuarter: rows(byQuarter).sort((a, b) => a.key.localeCompare(b.key)),
    perSqft: { won: median(sqftWon), all: median(sqftAll), samples: sqftAll.length, wonSamples: sqftWon.length },
    wonFromErp: fromErp,
    stale,
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
  avgDaysToPay: number | null;
  paidInvoices: number;
  recent: { id: string; name: string; outcome: Outcome; cents: number; created: string; url: string | null }[];
};

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
    preloaded ?? loadDealBundle(),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }),
    daysToPay(companyId),
  ]);
  const match = companyMatcher(companies);
  const deals = (await withErpWonAmounts(bundle)).deals.filter((d) => match(d)?.companyId === companyId);
  if (!deals.length && pay.n === 0) return null;
  const s = emptyStat();
  let gcNotAwarded = 0;
  const all: number[] = [], won: number[] = [];
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
    perSqftWonByScope: WORK_SCOPES.filter((k) => wonByScope.has(k)).map((k) => ({ label: WORK_SCOPE_LABELS[k], value: median(wonByScope.get(k)!)!, samples: wonByScope.get(k)!.length })),
    avgDaysToPay: pay.avg,
    paidInvoices: pay.n,
    recent: [...deals]
      .sort((a, b) => b.created.localeCompare(a.created))
      .slice(0, 8)
      .map((d) => ({ id: d.id, name: d.name, outcome: outcomeOf(bundle, d.stageId), cents: d.cents, created: d.created, url: dealUrl(bundle.hubId, d.id) })),
  };
}

// ── Price check on open quotes ──────────────────────────────────────────────

/** Fewer won jobs than this and the benchmark falls back to all bids of that type. */
const MIN_BENCHMARK_JOBS = 5;
/** Only quotes someone touched this recently are checked; older ones are on Stale quotes. */
export const PRICE_CHECK_ACTIVE_DAYS = 30;
/** This many times the middle price (or under 1 over it) is more likely a typo than a pricing call. */
const TYPO_FACTOR = 3;

export type PriceBenchmark = {
  scope: WorkScope;
  label: string;
  /** Usual range: the middle half of the jobs it's based on (25th to 75th percentile), and the middle */
  low: number;
  mid: number;
  high: number;
  basis: "won" | "all bids";
  samples: number;
};

export type PriceCheckRow = {
  id: string;
  name: string;
  scopeLabel: string;
  stage: string;
  owner: string | null;
  cents: number;
  sqft: number;
  perSqft: number;
  benchmark: PriceBenchmark;
  /** Quote vs the middle price, e.g. 0.42 = 42% above, -0.35 = 35% below */
  diff: number;
  url: string | null;
};

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/**
 * Open bids active in the last PRICE_CHECK_ACTIVE_DAYS with an amount and Area
 * SQFT, compared with the usual range for that type of work: the middle half
 * of won jobs (ERP contract value when the job is in the ERP), or of all bids
 * of that type when there aren't MIN_BENCHMARK_JOBS won jobs.
 * - outside: above or below that range.
 * - checkNumbers: TYPO_FACTOR times the middle or more (or a third or less),
 *   which is usually a wrong Area SQFT or amount in HubSpot.
 * Unknown type of work isn't checked.
 */
export async function quotePriceCheck(
  preloaded?: Bundle,
  now = new Date(),
): Promise<{ outside: PriceCheckRow[]; checkNumbers: PriceCheckRow[]; checked: number; benchmarks: PriceBenchmark[] }> {
  const bundle = preloaded ?? (await loadDealBundle());
  const { deals } = await withErpWonAmounts(bundle);
  const per = (d: RawDeal) => (d.sqft && d.cents ? d.cents / 100 / d.sqft : null);

  const benchmarks: PriceBenchmark[] = [];
  for (const scope of WORK_SCOPES) {
    if (scope === "UNKNOWN") continue;
    const ofType = deals.filter((d) => d.scope === scope && per(d) != null);
    const won = ofType.filter((d) => outcomeOf(bundle, d.stageId) === "won").map((d) => per(d)!);
    const basis = won.length >= MIN_BENCHMARK_JOBS ? "won" : "all bids";
    const values = (basis === "won" ? won : ofType.map((d) => per(d)!)).sort((a, b) => a - b);
    if (values.length < MIN_BENCHMARK_JOBS) continue;
    benchmarks.push({ scope, label: WORK_SCOPE_LABELS[scope], low: percentile(values, 0.25), mid: percentile(values, 0.5), high: percentile(values, 0.75), basis, samples: values.length });
  }

  const since = now.getTime() - PRICE_CHECK_ACTIVE_DAYS * DAY_MS;
  let checked = 0;
  const outside: PriceCheckRow[] = [], checkNumbers: PriceCheckRow[] = [];
  for (const d of deals) {
    if (outcomeOf(bundle, d.stageId) !== "open") continue;
    if (Date.parse(d.lastActivity ?? d.created) < since) continue;
    const p = per(d);
    const b = benchmarks.find((x) => x.scope === d.scope);
    if (p == null || !b) continue;
    checked++;
    const row: PriceCheckRow = {
      id: d.id,
      name: d.name,
      scopeLabel: WORK_SCOPE_LABELS[d.scope],
      stage: (bundle.stageLabels[d.stageId] ?? d.stageId).trim(),
      owner: d.ownerId ? (bundle.owners[d.ownerId] ?? null) : null,
      cents: d.cents,
      sqft: d.sqft!,
      perSqft: p,
      benchmark: b,
      diff: p / b.mid - 1,
      url: dealUrl(bundle.hubId, d.id),
    };
    if (p >= b.mid * TYPO_FACTOR || p <= b.mid / TYPO_FACTOR) checkNumbers.push(row);
    else if (p > b.high || p < b.low) outside.push(row);
  }
  const byDistance = (a: PriceCheckRow, b: PriceCheckRow) => Math.abs(b.diff) - Math.abs(a.diff);
  return { outside: outside.sort(byDistance), checkNumbers: checkNumbers.sort(byDistance), checked, benchmarks };
}
