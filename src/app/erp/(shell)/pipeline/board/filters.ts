/**
 * The board's filters: one state object, the quick views (presets of that
 * same state, so a view never hides anything the menu doesn't show), and the
 * function that applies it. Flag names match the card flags and the deal
 * panel (dealAttention.ts).
 */
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";
import type { MissingField } from "@/lib/erp/pipelineMissing";
import { LOST_KEYS, TODO_KEYS, type AttentionKey } from "@/lib/erp/dealAttention";
import { PRIORITIES, addDays, type Priority } from "@/lib/erp/pipelineUi";

export type Flag =
  "todo" | "lateStep" | "noStep" | "stuck" | "cleanup" | "quiet" | "missing" | "lostTodo" | "noReason" | "whoWon" | "rebid" | "strong" | "price" | "following";

/** "Only show", in groups. A card must match every flag picked. */
export const FLAG_GROUPS: { title: string; info: string; postConOnly?: boolean; flags: { value: Flag; label: string }[] }[] = [
  {
    title: "Needs attention",
    info: "Open deals. Next step late: its due date has passed. No next step: in a stage that needs one (Bidding on). Stuck: longer in its stage than allowed. Clean up: 180+ days in one stage. Quiet: a quote with no activity for 30 days. Missing info: something its stage needs.",
    flags: [
      { value: "todo", label: "Anything" },
      { value: "lateStep", label: "Next step late" },
      { value: "noStep", label: "No next step" },
      { value: "stuck", label: "Stuck" },
      { value: "cleanup", label: "Clean up" },
      { value: "quiet", label: "Quiet" },
      { value: "missing", label: "Missing info" },
    ],
  },
  {
    title: "Lost deals",
    info: "Needs a reason: no lost reason in HubSpot. Who won?: lost as GC not awarded in the last year, with no winner recorded. Ready to re-bid: the winner is recorded, no re-bid yet.",
    flags: [
      { value: "lostTodo", label: "Anything" },
      { value: "noReason", label: "Needs a reason" },
      { value: "whoWon", label: "Who won?" },
      { value: "rebid", label: "Ready to re-bid" },
    ],
  },
  {
    title: "Following",
    info: "Deals you follow. You get an email (and an inbox item) when one changes stage, is won or lost, or gets a new owner.",
    flags: [{ value: "following", label: "Deals I follow" }],
  },
  {
    title: "Chance",
    info: "Strong chance: about 15% or better from how similar bids turned out. Price flags: open quotes whose $ per sq ft is outside our usual range.",
    postConOnly: true,
    flags: [
      { value: "strong", label: "Strong chance" },
      { value: "price", label: "Price flags" },
    ],
  },
];

export type BidRange = "" | "next7" | "next30" | "thisMonth" | "nextMonth" | "past" | "none" | "custom";
export const BID_OPTIONS: { value: BidRange; label: string }[] = [
  { value: "", label: "Any" },
  { value: "next7", label: "Next 7 days" },
  { value: "next30", label: "Next 30 days" },
  { value: "past", label: "Past due" },
  { value: "none", label: "No bid date" },
  { value: "custom", label: "Dates" },
];
const MONTH_OPTIONS: { value: BidRange; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "nextMonth", label: "Next month" },
];
export const AWARD_OPTIONS: { value: BidRange; label: string }[] = [...BID_OPTIONS.slice(0, 3), ...MONTH_OPTIONS, ...BID_OPTIONS.slice(3)].map((o) => (o.value === "none" ? { ...o, label: "No award date" } : o.value === "past" ? { ...o, label: "Passed" } : o));

export type SortBy = "activity" | "chance" | "amount" | "bidDate" | "newest" | "daysInStage" | "priority";
/** Sort choices. Chance is post-construction only. */
export const SORT_OPTIONS: { value: SortBy; label: string; postConOnly?: boolean }[] = [
  { value: "activity", label: "Recent activity" },
  { value: "chance", label: "Chance to win", postConOnly: true },
  { value: "amount", label: "Amount, biggest first" },
  { value: "bidDate", label: "Bid date, soonest first" },
  { value: "newest", label: "Newest first" },
  { value: "daysInStage", label: "Longest in stage" },
  { value: "priority", label: "Priority, high first" },
];

export const PRIORITY_FILTER: { value: "" | Priority | "none"; label: string }[] = [{ value: "", label: "Any" }, ...PRIORITIES, { value: "none", label: "None set" }];

/** Owner values that aren't a person's name. */
export const ME = "__me";
export const NO_OWNER = "__none";

export type Filters = {
  owner: string;
  gc: string;
  kind: "" | BoardCard["companyKind"];
  scope: string;
  sortBy: SortBy;
  bid: BidRange;
  bidFrom: string;
  bidTo: string;
  award: BidRange;
  awardFrom: string;
  awardTo: string;
  flags: Flag[];
  missingField: MissingField | "";
  priority: "" | Priority | "none";
};

export const EMPTY: Filters = { owner: "", gc: "", kind: "", scope: "", sortBy: "activity", bid: "", bidFrom: "", bidTo: "", award: "", awardFrom: "", awardTo: "", flags: [], missingField: "", priority: "" };

export type ViewKey = "everything" | "mine" | "todos" | "cleanup" | "lost" | "bids" | "awardThis" | "awardNext" | "following";

/** Quick views: presets of the filters. `closed: "all"` also loads older won and lost deals. */
export function viewPreset(view: ViewKey, hasMine: boolean): { filters: Filters; closed?: "all" } {
  const mine = hasMine ? ME : "";
  if (view === "mine") return { filters: { ...EMPTY, owner: ME } };
  if (view === "todos") return { filters: { ...EMPTY, owner: mine, flags: ["todo"] } };
  if (view === "cleanup") return { filters: { ...EMPTY, flags: ["cleanup"] } };
  if (view === "lost") return { filters: { ...EMPTY, flags: ["lostTodo"] }, closed: "all" };
  if (view === "bids") return { filters: { ...EMPTY, bid: "next7" } };
  if (view === "awardThis") return { filters: { ...EMPTY, award: "thisMonth" } };
  if (view === "awardNext") return { filters: { ...EMPTY, award: "nextMonth" } };
  // Followed deals can be won or lost, so older closed ones load too.
  if (view === "following") return { filters: { ...EMPTY, flags: ["following"] }, closed: "all" };
  return { filters: EMPTY };
}

/**
 * A saved view's filters, read back safely: unknown keys dropped, wrong types
 * replaced with the empty value, so an old or odd saved view can't break the board.
 */
export function normalizeFilters(raw: unknown): Filters {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Filters = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof Filters)[]) {
    const v = r[key];
    if (key === "flags") {
      const known = new Set(FLAG_GROUPS.flatMap((g) => g.flags.map((f) => f.value)));
      out.flags = Array.isArray(v) ? v.filter((x): x is Flag => typeof x === "string" && known.has(x as Flag)) : [];
    } else if (typeof v === "string") {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  if (!SORT_OPTIONS.some((o) => o.value === out.sortBy)) out.sortBy = "activity";
  if (!BID_OPTIONS.some((o) => o.value === out.bid)) out.bid = "";
  if (!AWARD_OPTIONS.some((o) => o.value === out.award)) out.award = "";
  if (!PRIORITY_FILTER.some((o) => o.value === out.priority)) out.priority = "";
  return out;
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return JSON.stringify({ ...a, flags: [...a.flags].sort() }) === JSON.stringify({ ...b, flags: [...b.flags].sort() });
}

/** "2026-10-23" -> "2026-11", "2026-12-05" -> "2027-01". */
function nextMonthKey(day: string): string {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Bid due and Award date filters work the same way. */
function dateMatches(b: string | null, range: BidRange, from: string, to: string, today: string): boolean {
  if (range === "") return true;
  if (range === "none") return !b;
  if (!b) return false;
  if (range === "next7") return b >= today && b <= addDays(today, 7);
  if (range === "next30") return b >= today && b <= addDays(today, 30);
  if (range === "thisMonth") return b.slice(0, 7) === today.slice(0, 7);
  if (range === "nextMonth") return b.slice(0, 7) === nextMonthKey(today);
  if (range === "past") return b < today;
  return (!from || b >= from) && (!to || b <= to);
}

export type FilterContext = {
  today: string;
  search: string;
  viewerOwnerId: string | null;
  columnOf: Map<string, BoardColumn>;
  attentionOf: Map<string, AttentionKey[]>;
  /** Deal ids the viewer follows */
  following: Set<string>;
};

const YEAR_MS = 365 * 86_400_000;

/** The cards to show, in display order. */
export function applyFilters(cards: BoardCard[], f: Filters, ctx: FilterContext): BoardCard[] {
  const q = ctx.search.trim().toLowerCase();
  const yearAgo = new Date(Date.now() - YEAR_MS).toISOString();
  const has = (flag: Flag) => f.flags.includes(flag);
  const list = cards.filter((c) => {
    const col = ctx.columnOf.get(c.stageId);
    const open = col?.outcome === "open";
    const lost = col?.outcome === "lost";
    const att = ctx.attentionOf.get(c.id) ?? [];
    if (q && !c.name.toLowerCase().includes(q) && !(c.gc?.label.toLowerCase().includes(q) ?? false)) return false;
    if (f.owner && !(f.owner === ME ? c.ownerId === ctx.viewerOwnerId : f.owner === NO_OWNER ? !c.ownerId : c.owner === f.owner)) return false;
    if (f.gc && c.gc?.key !== f.gc) return false;
    if (f.scope && c.scope !== f.scope) return false;
    if (f.kind && c.companyKind !== f.kind) return false;
    if (f.priority && (f.priority === "none" ? !!c.priority : c.priority !== f.priority)) return false;
    if (has("todo") && !att.some((k) => TODO_KEYS.includes(k))) return false;
    if (has("lateStep") && !(open && c.nextStep && c.nextStep.dueDate < ctx.today)) return false;
    if (has("noStep") && !(open && col?.expectsNextStep && !c.nextStep)) return false;
    if (has("stuck") && !c.stuck) return false;
    if (has("cleanup") && !c.cleanup) return false;
    if (has("quiet") && !c.stale) return false;
    if (has("missing") && !(c.missing.length > 0 && (!f.missingField || c.missing.includes(f.missingField)))) return false;
    if (has("lostTodo") && !att.some((k) => LOST_KEYS.includes(k))) return false;
    if (has("noReason") && !(lost && c.lostReasons.length === 0)) return false;
    if (has("whoWon") && !(c.gcNotAwarded && !c.winner && c.activeAt >= yearAgo)) return false;
    if (has("rebid") && !(c.gcNotAwarded && c.winner && !c.rebid)) return false;
    if (has("strong") && c.chance?.band !== "Strong") return false;
    if (has("price") && !c.priceFlag) return false;
    if (has("following") && !ctx.following.has(c.id)) return false;
    return dateMatches(c.bidDate, f.bid, f.bidFrom, f.bidTo, ctx.today) && dateMatches(c.awardDate, f.award, f.awardFrom, f.awardTo, ctx.today);
  });
  // A sort picked by hand wins; Recent activity keeps the date-filter ordering below.
  if (f.sortBy === "chance") return [...list].sort((a, b) => (b.chance?.p ?? -1) - (a.chance?.p ?? -1));
  if (f.sortBy === "amount") return [...list].sort((a, b) => b.cents - a.cents);
  // No date goes last.
  if (f.sortBy === "bidDate") return [...list].sort((a, b) => (a.bidDate ?? "9999").localeCompare(b.bidDate ?? "9999"));
  if (f.sortBy === "newest") return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (f.sortBy === "daysInStage") return [...list].sort((a, b) => (b.daysInStage ?? -1) - (a.daysInStage ?? -1));
  if (f.sortBy === "priority") {
    const rank = (p: Priority | null) => (p === "high" ? 0 : p === "medium" ? 1 : p === "low" ? 2 : 3);
    return [...list].sort((a, b) => rank(a.priority) - rank(b.priority));
  }
  // Picking award dates or bid dates means "what's coming when", so the soonest goes on top. Award wins when both are picked.
  if (f.award && f.award !== "none") return [...list].sort((a, b) => (a.awardDate ?? "").localeCompare(b.awardDate ?? ""));
  if (f.bid && f.bid !== "none") return [...list].sort((a, b) => (a.bidDate ?? "").localeCompare(b.bidDate ?? ""));
  return list;
}
