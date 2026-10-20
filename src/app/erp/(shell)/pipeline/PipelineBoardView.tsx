"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard, BoardColumn, PipelineBoard } from "@/lib/erp/pipelineBoard";
import { MISSING_FIELDS, MISSING_LABELS, type MissingField } from "@/lib/erp/pipelineMissing";
import { DealInfoModal, type InfoSaved } from "./DealInfoModal";
import { DealPanel } from "./DealPanel";
import { RebidModal } from "./RebidModal";
import { MoveToModal } from "./MoveToModal";
import { LostReasonModal, type LostSaved, type Option } from "./LostReasonModal";
import { NextStepModal } from "./NextStepModal";
import type { NextStep } from "@/lib/erp/dealFollowUps";

/** What cards can do, without passing it through every column. */
type BoardActions = {
  labelOf: (reason: string) => string;
  edit: (card: BoardCard, markLost: boolean) => void;
  editNext: (card: BoardCard) => void;
  editInfo: (card: BoardCard) => void;
  /** "GC" on post-con, "Company" on janitorial */
  missingLabel: (f: MissingField) => string;
  openPanel: (card: BoardCard) => void;
  rebid: (card: BoardCard) => void;
  /** Move to: open the stage list */
  moveTo: (card: BoardCard) => void;
  /** Dragging: which card is in the air, and dropping it on a column */
  dragStart: (card: BoardCard) => void;
  dragEnd: () => void;
  dragging: BoardCard | null;
  drop: (col: BoardColumn) => void;
  /** Whether a card may be moved to a column (same rules as the server) */
  canMove: (card: BoardCard, col: BoardColumn) => boolean;
};
const ActionsContext = createContext<BoardActions | null>(null);

type Flag = "whowon" | "rebid" | "strong" | "missing" | "overdue" | "nonext" | "stuck" | "cleanup" | "stale" | "price" | "reason";
const FLAG_OPTIONS: { value: Flag; label: string }[] = [
  { value: "strong", label: "Strong chance" },
  { value: "missing", label: "Missing info" },
  { value: "overdue", label: "Overdue next step" },
  { value: "nonext", label: "No next step" },
  { value: "stuck", label: "Stuck" },
  { value: "cleanup", label: "Clean up" },
  { value: "stale", label: "Stale quotes" },
  { value: "price", label: "Price flags" },
  { value: "reason", label: "Needs a reason" },
  { value: "whowon", label: "Who won?" },
  { value: "rebid", label: "Ready to re-bid" },
];

type BidRange = "" | "next7" | "next30" | "past" | "none" | "custom";
const BID_OPTIONS: { value: BidRange; label: string }[] = [
  { value: "", label: "Any" },
  { value: "next7", label: "Next 7 days" },
  { value: "next30", label: "Next 30 days" },
  { value: "past", label: "Past due" },
  { value: "none", label: "No bid date" },
  { value: "custom", label: "Dates" },
];

/** "YYYY-MM-DD" plus n days. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Does a card's Bid Date fall in the picked range? */
function bidMatches(c: BoardCard, range: BidRange, today: string, from: string, to: string): boolean {
  const b = c.bidDate;
  if (range === "") return true;
  if (range === "none") return !b;
  if (!b) return false;
  if (range === "next7") return b >= today && b <= addDays(today, 7);
  if (range === "next30") return b >= today && b <= addDays(today, 30);
  if (range === "past") return b < today;
  return (!from || b >= from) && (!to || b <= to);
}

const filterDateCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/** Owner filter values that aren't a person's name. */
const ME = "__me";
const NO_OWNER = "__none";

/** "2026-10-22" to "Oct 22" without a time zone shift. */
function shortDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const pctOff = (diff: number) => `${Math.round(Math.abs(diff) * 100)}%`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Deal names often end with the GC ("... - Russo Development"); the card shows the GC on its own line. */
function shortName(c: BoardCard): string {
  const tail = c.gc ? ` - ${c.gc.label}` : "";
  return tail && c.name.toLowerCase().endsWith(tail.toLowerCase()) ? c.name.slice(0, -tail.length) : c.name;
}

/** Everything the card leaves out, for the hover text. */
function details(c: BoardCard, labelOf: (r: string) => string, missingLabel: (f: MissingField) => string): string {
  return [
    c.name,
    c.cents ? centsToDollars(c.cents) : "No amount",
    c.owner ? `Owner: ${c.owner}` : "No owner",
    c.scopeLabel,
    c.bidDate && `Bid ${shortDate(c.bidDate)}`,
    c.walkDate && `Job walk ${shortDate(c.walkDate)}`,
    c.daysInStage != null &&
      `${c.daysInStage} days in this stage${c.importedStage ? " (counted from the HubSpot import on Dec 26, 2024, so likely longer)" : ""}${
        c.cleanup ? ": clean up" : c.stuck ? ": stuck" : ""
      }`,
    c.daysQuiet != null && `${c.daysQuiet} days since last activity${c.stale ? " (stale)" : ""}`,
    c.chance && `Chance to win: ${c.chance.band} (about ${Math.round(c.chance.p * 100)}%). ${c.chance.reasons.join("; ")}`,
    c.gcRecord && `GC record: ${c.gcRecord.won} won of ${c.gcRecord.bids} bids${c.gcRecord.skip ? ". We've never won with this GC: worth bidding?" : ""}`,
    c.missing.length > 0 && `Missing: ${c.missing.map(missingLabel).join(", ")}`,
    c.nextStep && `Next step: ${c.nextStep.text}, due ${shortDate(c.nextStep.dueDate)}`,
    c.lostReasons.length > 0 && `Lost: ${c.lostReasons.map(labelOf).join(", ")}`,
    c.winner && `Won by ${c.winner.name}${c.winner.priceCents != null ? ` at ${centsToDollars(c.winner.priceCents)}` : ""}`,
    c.perSqft != null &&
      `$${c.perSqft.toFixed(2)} per sq ft${
        c.priceFlag
          ? c.priceFlag.kind === "check"
            ? ", far off usual: check the numbers"
            : `, ${pctOff(c.priceFlag.diff)} ${c.priceFlag.kind === "high" ? "above" : "below"} usual`
          : ""
      }`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The "..." menu on open cards. */
function CardMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label="Deal actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mr-1 -mt-0.5 rounded px-1 text-sm leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-32 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type CardFlag = { label: string; tone: string; onClick?: () => void };

const TONE = {
  red: "bg-red-50 text-red-700",
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700 hover:bg-sky-100",
  pink: "bg-pink-50 text-pink-700",
  gray: "bg-gray-100 text-gray-600",
} as const;

/**
 * The one flag an open card shows, most urgent first. Everything else is in
 * the hover text and the deal panel, and every filter still finds it.
 */
function openFlag(c: BoardCard, today: string, onFix: () => void): CardFlag | null {
  if (c.cleanup) return { label: "Clean up", tone: TONE.rose };
  if (c.bidDate && c.bidDate >= today && c.bidDate <= addDays(today, 3)) return { label: `Bid ${shortDate(c.bidDate)}`, tone: TONE.pink };
  if (c.stuck) return { label: `Stuck ${c.daysInStage}d`, tone: TONE.amber };
  if (c.missing.length) return { label: `Fix ${c.missing.length}`, tone: TONE.sky, onClick: onFix };
  if (c.stale && c.daysQuiet != null) return { label: `Quiet ${c.daysQuiet}d`, tone: TONE.amber };
  if (c.priceFlag)
    return {
      label: c.priceFlag.kind === "check" ? "Check price" : `${c.priceFlag.kind === "high" ? "+" : "-"}${pctOff(c.priceFlag.diff)} price`,
      tone: TONE.amber,
    };
  if (c.gcRecord?.skip) return { label: "Skip?", tone: TONE.gray };
  return null;
}

/** Lost cards: only the next thing to do, or nothing. */
function lostFlag(c: BoardCard, actions: BoardActions): CardFlag | null {
  if (!c.lostReasons.length) return { label: "Add reason", tone: TONE.rose, onClick: () => actions.edit(c, false) };
  if (c.gcNotAwarded && !c.winner) return { label: "Who won?", tone: TONE.amber, onClick: () => actions.edit(c, false) };
  if (c.gcNotAwarded && c.winner && !c.rebid)
    return { label: `Re-bid with ${c.winner.name}`, tone: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100", onClick: () => actions.rebid(c) };
  return null;
}

const STRIPE: Record<string, string> = { Strong: "bg-emerald-400", Fair: "bg-gray-300" };

function Card({ c, outcome, today }: { c: BoardCard; outcome: BoardColumn["outcome"]; today: string }) {
  const actions = useContext(ActionsContext)!;
  const flag = outcome === "open" ? openFlag(c, today, () => actions.editInfo(c)) : outcome === "lost" ? lostFlag(c, actions) : null;
  // Next step only when it needs attention: due this week or late.
  const step = outcome === "open" && c.nextStep && c.nextStep.dueDate <= addDays(today, 6) ? c.nextStep : null;
  const stripe = c.chance ? STRIPE[c.chance.band] : undefined;
  return (
    <div
      title={details(c, actions.labelOf, actions.missingLabel)}
      role="button"
      tabIndex={0}
      // The card opens the side panel; its own links and buttons (name, GC, flag, menu) keep doing their thing.
      onClick={(e) => !(e.target as HTMLElement).closest("a,button") && actions.openPanel(c)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && actions.openPanel(c)}
      // Open deals move anywhere; won deals only forward to a later won stage; lost deals stay put (moving a won deal to lost would delete its ERP project).
      draggable={outcome !== "lost"}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
        actions.dragStart(c);
      }}
      onDragEnd={() => actions.dragEnd()}
      className="relative cursor-pointer overflow-hidden rounded-md border border-gray-200 bg-white py-2 pl-3 pr-2.5 shadow-sm hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
    >
      {stripe && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${stripe}`} />}
      <div className="flex items-start justify-between gap-1">
        {c.url ? (
          <a href={c.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-xs font-medium leading-snug text-gray-900 hover:text-pink-600">
            {shortName(c)}
          </a>
        ) : (
          <span className="line-clamp-2 text-xs font-medium leading-snug text-gray-900">{shortName(c)}</span>
        )}
        {outcome === "open" && (
          <CardMenu
            items={[
              { label: "Next step", onClick: () => actions.editNext(c) },
              { label: "Edit info", onClick: () => actions.editInfo(c) },
              { label: "Move to", onClick: () => actions.moveTo(c) },
              { label: "Mark lost", onClick: () => actions.edit(c, true) },
            ]}
          />
        )}
        {outcome === "won" && <CardMenu items={[{ label: "Move to", onClick: () => actions.moveTo(c) }]} />}
      </div>
      {c.gc && (
        <p className="mt-0.5 truncate text-[11px] text-gray-400">
          {c.gc.companyId ? (
            <Link href={`/erp/companies/${c.gc.companyId}`} className="hover:text-pink-600">
              {c.gc.label}
            </Link>
          ) : (
            c.gc.label
          )}
        </p>
      )}
      {step && (
        <button
          type="button"
          onClick={() => actions.editNext(c)}
          className={`mt-1 block max-w-full truncate text-left text-[11px] hover:underline ${step.dueDate < today ? "font-medium text-red-600" : "text-amber-700"}`}
        >
          → {step.text} · {step.dueDate < today ? "late" : shortDate(step.dueDate)}
        </button>
      )}
      {outcome === "lost" && !flag && (c.lostReasons.length > 0 || c.rebid) && (
        <p className="mt-1 truncate text-[11px] text-gray-400">
          {c.rebid?.url ? (
            <a href={c.rebid.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
              Re-bid made
            </a>
          ) : (
            <button type="button" onClick={() => actions.edit(c, false)} className="hover:text-gray-600">
              {c.lostReasons.map(actions.labelOf).join(", ")}
            </button>
          )}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-gray-900">{c.cents ? centsToDollarsCompact(c.cents) : "-"}</span>
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium">
          {flag &&
            (flag.onClick ? (
              <button type="button" onClick={flag.onClick} className={`truncate rounded px-1.5 py-0.5 ${flag.tone}`}>
                {flag.label}
              </button>
            ) : (
              <span className={`truncate rounded px-1.5 py-0.5 ${flag.tone}`}>{flag.label}</span>
            ))}
          {c.owner && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[9px] font-semibold text-gray-600">
              {initials(c.owner)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({
  col,
  cards,
  today,
  closedDays,
  recentOnly,
}: {
  col: BoardColumn;
  cards: BoardCard[];
  today: string;
  closedDays: number;
  recentOnly: boolean;
}) {
  const actions = useContext(ActionsContext)!;
  const [over, setOver] = useState(false);
  const total = cards.reduce((s, c) => s + c.cents, 0);
  const stuck = cards.filter((c) => c.stuck).length;
  const tone = col.outcome === "won" ? "border-t-emerald-400" : col.outcome === "lost" ? "border-t-gray-300" : "border-t-pink-300";
  const canDrop = !!actions.dragging && actions.canMove(actions.dragging, col);
  return (
    <section
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (canDrop) actions.drop(col);
      }}
      className={`flex w-60 shrink-0 flex-col rounded-lg border border-t-4 bg-gray-50 ${tone} ${over && canDrop ? "border-pink-400 ring-2 ring-pink-200" : canDrop ? "border-dashed border-gray-300" : "border-gray-200"}`}
    >
      <header className="border-b border-gray-200 px-2.5 py-2">
        <h2 className="truncate text-xs font-semibold text-gray-900">{col.label}</h2>
        <p className="flex items-center gap-1 text-[11px] text-gray-500">
          {cards.length} · {centsToDollarsCompact(total)}
          {stuck > 0 && (
            <span className="text-amber-700" title={`Stuck after ${col.stuckLimit} days in this stage`}>
              · {stuck} stuck
            </span>
          )}
          {recentOnly && col.hidden > 0 && (
            <>
              <span className="text-gray-400">· {col.hidden} older</span>
              <InfoTip
                text={`Deals not created or active in the last ${closedDays} days are hidden here. Pick All under Older deals in the filter to see them.`}
              />
            </>
          )}
        </p>
      </header>
      <div className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-300">None</p>
        ) : (
          cards.map((c) => <Card key={c.id} c={c} outcome={col.outcome} today={today} />)
        )}
      </div>
    </section>
  );
}

/** Colors for what happened to last week's open deals; checked with the dataviz palette validator (light surface). */
const FLOW = [
  { key: "movedForward", label: "Moved forward", color: "#2a78d6" },
  { key: "won", label: "Won", color: "#1baf7a" },
  { key: "lost", label: "Closed lost", color: "#eb6834" },
  { key: "stayed", label: "Same stage", color: "#e5e7eb" },
] as const;

function Tile({ label, info, children }: { label: string; info: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[9rem] rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
        {label}
        <InfoTip align="right" text={info} />
      </p>
      {children}
    </div>
  );
}

/** Open pipeline $ per saved day. One series, so no legend; the tile names it. */
function Sparkline({ points }: { points: { day: string; cents: number }[] }) {
  if (points.length < 2) return <p className="mt-1 text-[11px] text-gray-400">Trend after 2 saved days</p>;
  const w = 120,
    h = 28,
    max = Math.max(...points.map((p) => p.cents)),
    min = Math.min(...points.map((p) => p.cents)),
    span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 2 - ((p.cents - min) / span) * (h - 4)] as const);
  const last = xy[xy.length - 1]!;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-7 w-[120px] overflow-visible" role="img" aria-label="Open pipeline by day">
      <title>{`${fmt(points[0]!.day)}: ${centsToDollarsCompact(points[0]!.cents)} · ${fmt(points[points.length - 1]!.day)}: ${centsToDollarsCompact(points[points.length - 1]!.cents)}`}</title>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#6b7280" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="#374151" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

/** "This week" above the board: what happened to last week's open deals, the open pipeline trend, new deals and the forecast. */
function WeeklyStrip({ board }: { board: PipelineBoard }) {
  const w = board.weekly;
  const f = board.forecast;
  const since = w ? new Date(`${w.sinceDay}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const flow = w ? FLOW.map((x) => ({ ...x, n: w[x.key] })) : [];
  const total = flow.reduce((t, x) => t + x.n, 0);
  const open = w?.trend.at(-1);
  const max = f ? Math.max(f.cents, f.wonLast12Cents, 1) : 1;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <div className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
          {w ? `Last week's ${w.baseOpen} open deals, since ${since}` : "This week"}
          <InfoTip
            text={
              w
                ? `What happened to the deals that were open on ${since} (the saved pipeline from a week ago, or the oldest saved day while there isn't one that old yet). Moved forward: now in a later stage. Won and Closed lost: closed since. Same stage: still where they were.`
                : "The ERP saves the pipeline every morning. This fills in once there's a saved day to compare with."
            }
          />
        </p>
        {w && total > 0 ? (
          <>
            {/* Part of a whole: one bar, 2px gaps between segments, every segment labeled below. */}
            <div className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded">
              {flow
                .filter((x) => x.n > 0)
                .map((x) => (
                  <div
                    key={x.key}
                    title={`${x.label}: ${x.n}`}
                    className="h-full first:rounded-l last:rounded-r"
                    style={{ width: `${(x.n / total) * 100}%`, background: x.color }}
                  />
                ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
              {flow.map((x) => (
                <li key={x.key} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: x.color }} />
                  {x.label} <span className="font-semibold tabular-nums text-gray-900">{x.n}</span>
                  {x.key === "won" && w.wonCents > 0 && <span className="text-gray-500">{centsToDollarsCompact(w.wonCents)}</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-gray-400">Starts after the first daily snapshot.</p>
        )}
      </div>

      {w && (
        <Tile label="New" info={`Deals created since ${since} that are still open, and their HubSpot amounts.`}>
          <p className="text-lg font-semibold tabular-nums text-gray-900">
            +{w.newDeals}
            {w.newCents > 0 && <span className="ml-1 text-xs font-normal text-gray-500">{centsToDollarsCompact(w.newCents)}</span>}
          </p>
        </Tile>
      )}

      {w && (
        <Tile
          label="Open pipeline"
          info="Open deals' HubSpot amounts added up, per saved day over the last 30 days. Hover the line for the first and last day."
        >
          <p className="text-lg font-semibold tabular-nums text-gray-900">{open ? centsToDollarsCompact(open.cents) : "-"}</p>
          <Sparkline points={w.trend} />
        </Tile>
      )}

      {f && (
        <Tile
          label="Forecast"
          info={`Each open deal's amount times its chance to win, adding up ${f.deals} deals. Clean up deals are left out because they're usually dead. A rough guide, not a promise: the gray bar is what we actually won from bids created in the last 12 months (${f.wonLast12} jobs).`}
        >
          {/* Two magnitudes on one scale: the forecast and, for scale, what we really won. */}
          <div className="mt-1 space-y-1 text-[11px]">
            {[
              { label: "Forecast", cents: f.cents, color: "#374151" },
              { label: "Won, last 12 mo", cents: f.wonLast12Cents, color: "#d1d5db" },
            ].map((x) => (
              <div key={x.label} className="flex items-center gap-2" title={`${x.label}: ${centsToDollars(x.cents)}`}>
                <span className="w-20 shrink-0 text-gray-500">{x.label}</span>
                <span className="h-2 rounded-r" style={{ width: `${Math.max(4, (x.cents / max) * 72)}px`, background: x.color }} />
                <span className="font-semibold tabular-nums text-gray-900">{centsToDollarsCompact(x.cents)}</span>
              </div>
            ))}
          </div>
        </Tile>
      )}
    </div>
  );
}

/**
 * The board plus its toolbar: search, and the filter menu (same look as
 * Win/Loss and Billing). The older deals range is in the URL because the server
 * leaves older closed deals out; everything else narrows the cards loaded.
 */
export function PipelineBoardView({
  board,
  closedDays,
  cleanupDays,
  scopes,
  startOnMine,
  reasonOptions,
  companies,
  mayEditCompanies,
}: {
  /** Admin and Business Manager: can add a typed company name to a company's other names */
  mayEditCompanies: boolean;
  board: PipelineBoard;
  /** HubSpot Deal Lost Reason options */
  reasonOptions: Option[];
  /** Companies, for who won a GC Not Awarded job */
  companies: Option[];
  closedDays: number;
  cleanupDays: number;
  scopes: { value: string; label: string }[];
  /** Open on the viewer's own deals (Sales and Estimation), when they own any here */
  startOnMine: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = useId();
  const toast = useToast();
  // Reasons and Mark lost saved on this page, applied until the page reloads (the server applies them after that).
  const [saved, setSaved] = useState<Map<string, LostSaved>>(new Map());
  const [editing, setEditing] = useState<{ card: BoardCard; markLost: boolean } | null>(null);
  // Next steps saved on this page (null = marked done), same idea as `saved`.
  const [nextSaved, setNextSaved] = useState<Map<string, NextStep | null>>(new Map());
  const [editingNext, setEditingNext] = useState<BoardCard | null>(null);
  // Info edits saved on this page, same idea as `saved`.
  const [infoSaved, setInfoSaved] = useState<Map<string, InfoSaved>>(new Map());
  const [editingInfo, setEditingInfo] = useState<BoardCard | null>(null);
  const [missingField, setMissingField] = useState<MissingField | "">("");
  // The open side panel's deal; its data comes from `cards`, so edits show there at once.
  const [panelId, setPanelId] = useState<string | null>(null);
  // Re-bids made on this page, by lost deal id.
  const [rebidSaved, setRebidSaved] = useState<Map<string, { newDealId: string; url: string | null }>>(new Map());
  const [editingRebid, setEditingRebid] = useState<BoardCard | null>(null);
  // Stage moves made on this page (drag, Move to, Undo), by deal id.
  const [stageSaved, setStageSaved] = useState<Map<string, string>>(new Map());
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [movingTo, setMovingTo] = useState<BoardCard | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string; from: string; to: string; toLabel: string } | null>(null);
  const confirm = useConfirm();
  const nextIds = useMemo(() => new Set(board.columns.filter((c) => c.expectsNextStep).map((c) => c.stageId)), [board.columns]);
  const lostIds = useMemo(() => new Set(board.columns.filter((c) => c.outcome === "lost").map((c) => c.stageId)), [board.columns]);
  const lostLabel = board.columns.find((c) => c.outcome === "lost")?.label ?? "lost";
  const cards = useMemo(
    () =>
      saved.size || nextSaved.size || infoSaved.size || rebidSaved.size || stageSaved.size
        ? board.cards.map((orig) => {
            const info = infoSaved.get(orig.id);
            // Fixed fields drop off Missing; the server works it out again on the next load.
            const withInfo = info
              ? {
                  ...orig,
                  ...info,
                  missing: orig.missing.filter((m) =>
                    m === "owner"
                      ? !info.ownerId || !board.activeOwners.some((o) => o.id === info.ownerId)
                      : m === "company"
                        ? !info.gc
                        : m === "bidDate"
                          ? !info.bidDate
                          : m === "amount"
                            ? !info.cents
                            : !info.sqft,
                  ),
                }
              : orig;
            // A stage move starts the clock over: no Stuck, Clean up or Quiet until the next refresh says otherwise.
            const st = stageSaved.get(orig.id);
            const c = st && st !== withInfo.stageId ? { ...withInfo, stageId: st, daysInStage: 0, stuck: false, cleanup: false, stale: false } : withInfo;
            const s = saved.get(c.id);
            const rb = rebidSaved.get(c.id);
            const n: Partial<BoardCard> = { ...(nextSaved.has(c.id) ? { nextStep: nextSaved.get(c.id) ?? null } : {}), ...(rb ? { rebid: rb } : {}) };
            if (!s) return { ...c, ...n };
            const moved = s.stageId !== c.stageId;
            return {
              ...c,
              ...n,
              stageId: s.stageId,
              lostReasons: s.reasons,
              gcNotAwarded: board.pipeline === "post-con" && s.reasons.includes("GC Not Awarded"),
              winner: s.winner,
              ...(moved ? { stuck: false, cleanup: false, stale: false, priceFlag: null } : {}),
            };
          })
        : board.cards,
    [board.cards, board.activeOwners, board.pipeline, saved, nextSaved, infoSaved, rebidSaved, stageSaved],
  );
  /**
   * Moves the card on screen first, then saves to HubSpot (a move makes a few
   * HubSpot calls, and on a dev server the first one also compiles, so waiting
   * for it looked like nothing happened). If HubSpot refuses, the card goes
   * back and the reason shows.
   */
  async function sendMove(card: { id: string; name: string }, from: string, to: string, confirmWon: boolean): Promise<boolean> {
    const before = stageSaved.get(card.id);
    setStageSaved((m) => new Map(m).set(card.id, to));
    const revert = () =>
      setStageSaved((m) => {
        const next = new Map(m);
        if (before === undefined) next.delete(card.id);
        else next.set(card.id, before);
        return next;
      });
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: board.pipeline, fromStageId: from, toStageId: to, confirmWon }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || !data || data.error) {
        revert();
        toast(data?.error ?? "Couldn't move it. Try again.", "error");
        return false;
      }
      return true;
    } catch {
      revert();
      toast("Couldn't reach the server, so the card went back. Try again.", "error");
      return false;
    }
  }

  /** Drag or Move to: lost asks for the reason, won asks to confirm, open moves at once with Undo. */
  /** Open: any other stage. Won: only a later won stage. Lost: nowhere. Matches dealStageMove.ts. */
  function canMove(card: BoardCard, col: BoardColumn): boolean {
    const from = board.columns.findIndex((c) => c.stageId === card.stageId);
    const fromCol = board.columns[from];
    if (!fromCol || col.stageId === card.stageId || fromCol.outcome === "lost") return false;
    if (fromCol.outcome === "won") return col.outcome === "won" && board.columns.indexOf(col) > from;
    return true;
  }

  async function moveCard(card: BoardCard, col: BoardColumn) {
    if (!canMove(card, col)) return;
    const fromWon = board.columns.some((c) => c.stageId === card.stageId && c.outcome === "won");
    if (fromWon) {
      const billing = /billing/i.test(col.label);
      const completed = /complete/i.test(col.label);
      const ok = await confirm({
        title: `Move to ${col.label}?`,
        message: `Moves "${card.name}" to ${col.label} in HubSpot. On the next HubSpot sync the ERP project follows${
          billing ? ": it's marked billed" : completed ? ": it's marked Complete, and if it was billed, paid" : ""
        }. There's no undo, and won deals can't be moved back from the board.`,
        confirmLabel: "Move",
        danger: false,
      });
      if (ok && (await sendMove(card, card.stageId, col.stageId, true))) toast(`Moved to ${col.label}.`, "success");
      return;
    }
    if (col.outcome === "lost") return setEditing({ card, markLost: true });
    if (col.outcome === "won") {
      const ok = await confirm({
        title: `Move to ${col.label}?`,
        message: `This marks "${card.name}" as won in HubSpot. The next HubSpot sync creates an ERP project for it. Moving it back later won't remove that project.`,
        confirmLabel: "Move",
        danger: false,
      });
      if (ok && (await sendMove(card, card.stageId, col.stageId, true)))
        toast(`Moved to ${col.label}. The ERP project is made on the next HubSpot sync.`, "success");
      return;
    }
    // Undo shows right away with the move; it goes if the save fails.
    const move = { id: card.id, name: card.name, from: card.stageId, to: col.stageId, toLabel: col.label };
    setUndo(move);
    if (!(await sendMove(card, card.stageId, col.stageId, false))) setUndo((u) => (u === move ? null : u));
  }

  // The memoized card actions call the latest moveCard through this.
  const moveRef = useRef(moveCard);
  moveRef.current = moveCard;
  const canMoveRef = useRef(canMove);
  canMoveRef.current = canMove;

  // Undo is offered for 10 seconds.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(t);
  }, [undo]);

  async function undoMove() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    if (await sendMove({ id: u.id, name: u.name }, u.to, u.from, false)) toast("Move undone.", "success");
  }

  const isJan = board.pipeline === "janitorial";
  const actions = useMemo<BoardActions>(() => {
    const labels = new Map(reasonOptions.map((o) => [o.value, o.label]));
    return {
      labelOf: (r) => labels.get(r) ?? r,
      edit: (card, markLost) => setEditing({ card, markLost }),
      editNext: (card) => setEditingNext(card),
      editInfo: (card) => setEditingInfo(card),
      missingLabel: (f) => (f === "company" && isJan ? "Company" : MISSING_LABELS[f]),
      openPanel: (card) => setPanelId(card.id),
      rebid: (card) => setEditingRebid(card),
      moveTo: (card) => setMovingTo(card),
      dragStart: (card) => setDragging(card),
      dragEnd: () => setDragging(null),
      dragging,
      canMove: (card, col) => canMoveRef.current(card, col),
      drop: (col) => {
        if (dragging) void moveRef.current(dragging, col);
        setDragging(null);
      },
    };
  }, [reasonOptions, isJan, dragging]);
  const [search, setSearch] = useState("");
  const hasMine = !!board.viewerOwnerId && cards.some((c) => c.ownerId === board.viewerOwnerId);
  const defaultOwner = startOnMine && hasMine ? ME : "";
  const [owner, setOwner] = useState(defaultOwner);
  const [gc, setGc] = useState("");
  const [scope, setScope] = useState("");
  const [kind, setKind] = useState<"" | BoardCard["companyKind"]>("");
  const [flags, setFlags] = useState<Flag[]>([]);
  const [sortBy, setSortBy] = useState<"activity" | "chance">("activity");
  const [bid, setBid] = useState<BidRange>("");
  const [bidFrom, setBidFrom] = useState("");
  const [bidTo, setBidTo] = useState("");
  const recentOnly = board.closed === "recent";
  // Janitorial deals are for property managers and owners, not GCs.
  const companyWord = isJan ? "Company" : "GC";
  // Eastern day, so a bid due today still counts as upcoming in the evening.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const active = owner !== defaultOwner || gc !== "" || scope !== "" || kind !== "" || flags.length > 0 || bid !== "" || sortBy !== "activity" || !recentOnly;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const ownerOptions = useMemo(() => {
    const names = [...new Set(cards.map((c) => c.owner).filter((o): o is string => !!o))].sort().map((o) => ({ value: o, label: o }));
    const me = board.viewerOwnerId ? cards.find((c) => c.ownerId === board.viewerOwnerId)?.owner : null;
    return [...(me ? [{ value: ME, label: `Me (${me})` }] : []), { value: NO_OWNER, label: "No owner" }, ...names];
  }, [cards, board.viewerOwnerId]);
  const gcOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) if (c.gc) m.set(c.gc.key, c.gc.label);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cards]);

  const yearAgo = useMemo(() => new Date(Date.now() - 365 * 86_400_000).toISOString(), []);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cards.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q) || (c.gc?.label.toLowerCase().includes(q) ?? false)) &&
        (!owner || (owner === ME ? c.ownerId === board.viewerOwnerId : owner === NO_OWNER ? !c.ownerId : c.owner === owner)) &&
        (!gc || c.gc?.key === gc) &&
        (!scope || c.scope === scope) &&
        (!kind || c.companyKind === kind) &&
        (!flags.includes("stuck") || c.stuck) &&
        (!flags.includes("cleanup") || c.cleanup) &&
        (!flags.includes("stale") || c.stale) &&
        (!flags.includes("price") || c.priceFlag != null) &&
        (!flags.includes("strong") || c.chance?.band === "Strong") &&
        (!flags.includes("whowon") || (c.gcNotAwarded && !c.winner && c.activeAt >= yearAgo)) &&
        (!flags.includes("rebid") || (c.gcNotAwarded && !!c.winner && !c.rebid)) &&
        (!flags.includes("missing") || (c.missing.length > 0 && (!missingField || c.missing.includes(missingField)))) &&
        (!flags.includes("overdue") || (c.nextStep != null && c.nextStep.dueDate < today && !lostIds.has(c.stageId))) &&
        (!flags.includes("nonext") || (nextIds.has(c.stageId) && !c.nextStep)) &&
        (!flags.includes("reason") || (lostIds.has(c.stageId) && c.lostReasons.length === 0)) &&
        bidMatches(c, bid, today, bidFrom, bidTo),
    );
    // Picking bid dates means "what's due when", so soonest bid goes on top.
    if (sortBy === "chance") return [...list].sort((a, b) => (b.chance?.p ?? -1) - (a.chance?.p ?? -1));
    return bid && bid !== "none" ? [...list].sort((a, b) => (a.bidDate ?? "").localeCompare(b.bidDate ?? "")) : list;
  }, [yearAgo, cards, board.viewerOwnerId, search, owner, gc, scope, flags, bid, bidFrom, bidTo, today, lostIds, nextIds, missingField, sortBy, kind]);

  const panelCard = panelId ? (cards.find((c) => c.id === panelId) ?? null) : null;
  const closePanel = useCallback(() => setPanelId(null), []);

  // Counts per field over the cards the other filters leave, before picking one field.
  const missingCounts = useMemo(() => {
    const m = new Map<MissingField, number>();
    for (const c of shown) for (const f of c.missing) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [shown]);

  const byStage = useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const c of shown) m.set(c.stageId, [...(m.get(c.stageId) ?? []), c]);
    return m;
  }, [shown]);

  function setClosed(next: "recent" | "all") {
    if (next === board.closed) return;
    const q = new URLSearchParams();
    if (isJan) q.set("pipeline", "janitorial");
    if (next === "all") q.set("closed", "all");
    router.push(q.size ? `/erp/pipeline?${q}` : "/erp/pipeline");
  }

  function reset() {
    setOwner(defaultOwner);
    setGc("");
    setScope("");
    setKind("");
    setFlags([]);
    setSortBy("activity");
    setMissingField("");
    setBid("");
    setBidFrom("");
    setBidTo("");
    setClosed("recent");
  }

  const label = "text-[10px] font-semibold uppercase tracking-wide text-gray-400";
  const radio = "h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400";

  return (
    <div className="space-y-3">
      <WeeklyStrip board={board} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search deal or ${companyWord}…`}
            aria-label="Search deals"
            className="h-8 w-56 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <span className="text-xs text-gray-500">
            {shown.length} deals · {centsToDollarsCompact(shown.reduce((s, c) => s + c.cents, 0))}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 text-[11px] text-gray-500 sm:flex">
            {!isJan &&
              (["Strong", "Fair"] as const).map((band) => (
                <span key={band} className="flex items-center gap-1">
                  <span className={`h-3 w-1 rounded-sm ${STRIPE[band]}`} />
                  {band} chance
                </span>
              ))}
            <InfoTip
              align="right"
              text={
                isJan
                  ? "Each card: deal name (opens HubSpot), company, amount and the owner's initials, plus the one thing that needs attention most (Clean up, Stuck, Fix, Quiet). A next step shows when it's due this week or late. Hover a card or click it for everything else."
                  : "Each card: deal name (opens HubSpot), GC, amount and the owner's initials, plus the one thing that needs attention most: Clean up, a bid due in 3 days, Stuck, Fix, Quiet, a price flag or Skip?. A next step shows when it's due this week or late. The stripe on the left is the chance to win (green Strong, gray Fair, none for Long shot). Hover a card or click it for everything else."
              }
            />
          </div>
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Filter"
              aria-expanded={open}
              className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                active ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
              </svg>
            </button>
            {open && (
              <div className="absolute right-0 z-20 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <p className={label}>Owner</p>
                <SearchableSelect className="mt-1.5" value={owner} onChange={setOwner} options={ownerOptions} allLabel="All owners" placeholder="All owners" />
                <p className={`${label} mt-3`}>{companyWord}</p>
                <SearchableSelect
                  className="mt-1.5"
                  value={gc}
                  onChange={setGc}
                  options={gcOptions}
                  allLabel={`All ${companyWord === "GC" ? "GCs" : "companies"}`}
                  placeholder={`All ${companyWord === "GC" ? "GCs" : "companies"}`}
                />

                <div className="my-3 border-t border-gray-100" />
                <p className={`${label} flex items-center gap-1`}>
                  Company type
                  <InfoTip
                    align="right"
                    text="GCs: general contractors. Property managers and owners: clients who hire us directly. Not linked: a company name that matches no company in the ERP. No company: none on the deal."
                  />
                </p>
                <div className="mt-1.5 space-y-1">
                  {(
                    [
                      { value: "", label: "All" },
                      { value: "gc", label: "GCs" },
                      { value: "client", label: "Property managers and owners" },
                      { value: "unlinked", label: "Not linked" },
                      { value: "none", label: "No company" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value || "all"} className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name={`${name}-kind`} checked={kind === opt.value} onChange={() => setKind(opt.value)} className={radio} />
                      {opt.label}
                    </label>
                  ))}
                </div>

                {!isJan && (
                  <>
                    <div className="my-3 border-t border-gray-100" />
                    <p className={label}>Type of work</p>
                    <div className="mt-1.5 space-y-1">
                      {[{ value: "", label: "All work" }, ...scopes].map((opt) => (
                        <label key={opt.value || "all"} className="flex items-center gap-2 text-xs text-gray-700">
                          <input type="radio" name={`${name}-scope`} checked={scope === opt.value} onChange={() => setScope(opt.value)} className={radio} />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="my-3 border-t border-gray-100" />
                <p className={`${label} flex items-center gap-1`}>
                  Bid due
                  <InfoTip
                    align="right"
                    text="HubSpot's Bid Date. Past due means the bid date has passed and the deal is still on the board. Picking a range sorts cards by bid date, soonest first."
                  />
                </p>
                <div className="mt-1.5 space-y-1">
                  {BID_OPTIONS.map((opt) => (
                    <label key={opt.value || "any"} className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="radio" name={`${name}-bid`} checked={bid === opt.value} onChange={() => setBid(opt.value)} className={radio} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {bid === "custom" && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <label className="block text-xs text-gray-700">
                      From
                      <input type="date" value={bidFrom} max={bidTo || undefined} onChange={(e) => setBidFrom(e.target.value)} className={filterDateCls} />
                    </label>
                    <label className="block text-xs text-gray-700">
                      To
                      <input type="date" value={bidTo} min={bidFrom || undefined} onChange={(e) => setBidTo(e.target.value)} className={filterDateCls} />
                    </label>
                  </div>
                )}

                {!isJan && (
                  <>
                    <div className="my-3 border-t border-gray-100" />
                    <p className={`${label} flex items-center gap-1`}>
                      Sort
                      <InfoTip
                        align="right"
                        text="Recent activity puts the deals touched most recently on top. Chance to win puts the best odds on top, from how similar bids turned out."
                      />
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {(
                        [
                          { value: "activity", label: "Recent activity" },
                          { value: "chance", label: "Chance to win" },
                        ] as const
                      ).map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                          <input type="radio" name={`${name}-sort`} checked={sortBy === opt.value} onChange={() => setSortBy(opt.value)} className={radio} />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="my-3 border-t border-gray-100" />
                <p className={`${label} flex items-center gap-1`}>
                  Older deals
                  <InfoTip
                    align="right"
                    text={`Lead, won and lost stages show deals created or active in the last ${closedDays} days unless All is picked. Other stages always show every deal.`}
                  />
                </p>
                <div className="mt-1.5 space-y-1">
                  {(
                    [
                      { value: "recent", label: `Last ${closedDays} days` },
                      { value: "all", label: "All" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="radio"
                        name={`${name}-closed`}
                        checked={board.closed === opt.value}
                        onChange={() => setClosed(opt.value)}
                        className={radio}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                <div className="my-3 border-t border-gray-100" />
                <p className={`${label} flex items-center gap-1`}>
                  Only show
                  <InfoTip
                    align="right"
                    text={
                      isJan
                        ? `Stuck: in an open stage longer than its limit (14 days, 30 for Proposal). Clean up: ${cleanupDays} days or more in one open stage, usually a dead deal to close out in HubSpot. Stale quotes: in a quote stage before the deal is won, quiet for 30 days or more.`
                        : `Stuck: in an open stage longer than its limit (14 days, 30 for Quote Sent, 21 for Negotiation and Competitive Quote). Clean up: ${cleanupDays} days or more in one open stage, usually a dead deal to close out in HubSpot. ` +
                          "Stale quotes: in Quote Sent through the stage before Quote Approved, quiet for 30 days or more. Price flags: open quotes active in 30 days whose $ per sq ft is outside the usual range, same as the Estimation dashboard's Price check. Cards must match everything picked."
                    }
                  />
                </p>
                <div className="mt-1.5 space-y-1">
                  {FLAG_OPTIONS.filter((o) => !isJan || !["price", "strong", "whowon", "rebid"].includes(o.value)).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={flags.includes(opt.value)}
                        onChange={(e) => setFlags((f) => (e.target.checked ? [...f, opt.value] : f.filter((x) => x !== opt.value)))}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                {active && (
                  <>
                    <div className="my-3 border-t border-gray-100" />
                    <Button variant="ghost" size="xs" onClick={reset}>
                      Reset filters
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {flags.includes("missing") && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-gray-500">
            Missing
            <InfoTip text="Open deals missing what their stage needs: an active owner and a GC always; a Bid Date from Bidding on; an amount (and on post-construction, Area SQFT) in the quote stages. Click one to see only those. Click Fix on a card to fill it in." />
          </span>
          {MISSING_FIELDS.map((f) => {
            const n = missingCounts.get(f) ?? 0;
            if (!n) return null;
            const on = missingField === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setMissingField(on ? "" : f)}
                className={`rounded-full border px-2 py-0.5 ${on ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
              >
                {actions.missingLabel(f)} {n}
              </button>
            );
          })}
        </div>
      )}
      <ActionsContext.Provider value={actions}>
        <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
          {board.columns.map((col) => (
            <Column key={col.stageId} col={col} cards={byStage.get(col.stageId) ?? []} today={today} closedDays={closedDays} recentOnly={recentOnly} />
          ))}
        </div>
      </ActionsContext.Provider>
      {movingTo && (
        <MoveToModal
          card={movingTo}
          columns={board.columns.filter((c) => canMove(movingTo, c))}
          onClose={() => setMovingTo(null)}
          onPick={(col) => {
            const card = movingTo;
            setMovingTo(null);
            void moveCard(card, col);
          }}
        />
      )}
      {undo && (
        <div className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          <span className="max-w-[60vw] truncate">
            Moved {undo.name} to {undo.toLabel}
          </span>
          <button type="button" onClick={() => void undoMove()} className="font-semibold text-pink-300 hover:text-pink-200">
            Undo
          </button>
        </div>
      )}
      {editingRebid && (
        <RebidModal
          card={editingRebid}
          owners={board.activeOwners.map((o) => ({ value: o.id, label: o.name }))}
          defaultOwnerId={board.activeOwners.some((o) => o.id === editingRebid.ownerId) ? (editingRebid.ownerId ?? "") : (board.viewerOwnerId ?? "")}
          onClose={() => setEditingRebid(null)}
          onSaved={(r) => {
            setRebidSaved((m) => new Map(m).set(editingRebid.id, r));
            setEditingRebid(null);
            toast("Re-bid deal created in HubSpot. It shows in Lead after the next refresh.", "success");
          }}
        />
      )}
      {panelCard && (
        <DealPanel
          card={panelCard}
          column={board.columns.find((c) => c.stageId === panelCard.stageId)}
          pipeline={board.pipeline}
          today={today}
          labelOf={actions.labelOf}
          winBacktest={board.winBacktest}
          winBase={board.winBase}
          priceRanges={board.priceRanges}
          onClose={closePanel}
          onNextStep={() => setEditingNext(panelCard)}
          onEditInfo={() => setEditingInfo(panelCard)}
          onMoveTo={() => setMovingTo(panelCard)}
          onLost={() => setEditing({ card: panelCard, markLost: !lostIds.has(panelCard.stageId) })}
          onRebid={panelCard.gcNotAwarded && panelCard.winner && !panelCard.rebid ? () => setEditingRebid(panelCard) : undefined}
        />
      )}
      {editingInfo && (
        <DealInfoModal
          card={editingInfo}
          pipeline={board.pipeline}
          owners={board.activeOwners.map((o) => ({ value: o.id, label: o.name }))}
          companies={companies}
          mayEditCompanies={mayEditCompanies}
          onClose={() => setEditingInfo(null)}
          onSaved={(info) => {
            setInfoSaved((m) => new Map(m).set(editingInfo.id, info));
            setEditingInfo(null);
            toast("Saved in HubSpot.", "success");
          }}
        />
      )}
      {editingNext && (
        <NextStepModal
          card={editingNext}
          pipeline={board.pipeline}
          today={today}
          onClose={() => setEditingNext(null)}
          onSaved={(next) => {
            setNextSaved((m) => new Map(m).set(editingNext.id, next));
            setEditingNext(null);
            toast(next ? "Next step saved." : "Next step done.", "success");
          }}
        />
      )}
      {editing && (
        <LostReasonModal
          card={editing.card}
          pipeline={board.pipeline}
          markLost={editing.markLost}
          lostStageLabel={lostLabel}
          reasonOptions={reasonOptions}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            const { card, markLost } = editing;
            setSaved((m) => new Map(m).set(card.id, result));
            setEditing(null);
            toast(markLost ? `Marked lost in HubSpot: ${card.name}` : "Lost reason saved in HubSpot.", "success");
          }}
        />
      )}
    </div>
  );
}
