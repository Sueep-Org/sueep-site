"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button, InfoTip } from "@/app/erp/components/ui";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard, BoardColumn, PipelineBoard } from "@/lib/erp/pipelineBoard";
import type { ActivityKind, DealPanelData } from "@/lib/erp/dealPanel";
import type { WinBacktest } from "@/lib/erp/winChance";
import { CHART, BAND_COLOR, BAND_TEXT, fullDate, pct, shortDay } from "@/lib/erp/pipelineUi";
import { TONE_BOX, type Attention, type AttentionAction } from "@/lib/erp/dealAttention";

const KIND_LABEL: Record<ActivityKind, string> = { email: "Email", call: "Call", note: "Note", task: "Task", meeting: "Meeting" };
const KIND_DOT: Record<ActivityKind, string> = {
  email: "bg-sky-400",
  call: "bg-emerald-400",
  note: "bg-amber-400",
  task: "bg-violet-400",
  meeting: "bg-pink-400",
};
const WON = CHART.won;
const LOST = CHART.lost;
const FACTOR = CHART.moved;
const when = fullDate;

function Section({ title, info, children, right }: { title: string; info: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold text-gray-900">
          {title}
          <InfoTip text={info} />
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A list that shows its first few rows and folds the rest away. */
function Folded<T>({ items, first, render, more }: { items: T[]; first: number; render: (x: T, i: number) => React.ReactNode; more: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, first);
  return (
    <>
      {shown.map(render)}
      {items.length > first && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs text-pink-600 hover:underline">
          {open ? "Show less" : `${more} (${items.length - first} more)`}
        </button>
      )}
    </>
  );
}

/**
 * Side panel for one deal, built around what helps us win it: the chance to
 * win and why, what to do next, the price against our usual range, and the
 * GC's record. The long lists (activity, line items, ERP history) are folded.
 * Card data comes from the board, so edits show at once; the rest loads when
 * the panel opens.
 */
export function DealPanel({
  card,
  column,
  pipeline,
  attention,
  labelOf,
  winBacktest,
  winBase,
  priceRanges,
  onClose,
  onNextStep,
  onEditInfo,
  onMoveTo,
  onLost,
  onRebid,
}: {
  card: BoardCard;
  column: BoardColumn | undefined;
  pipeline: "post-con" | "janitorial";
  /** What needs attention, from the board (dealAttention.ts), so the panel and the card agree */
  attention: Attention[];
  labelOf: (reason: string) => string;
  winBacktest: WinBacktest | null;
  winBase: number | null;
  priceRanges: PipelineBoard["priceRanges"];
  onClose: () => void;
  onNextStep: () => void;
  onEditInfo: () => void;
  onMoveTo: () => void;
  /** Mark lost (open deals) or change the lost reason (lost deals) */
  onLost: () => void;
  /** Re-bid with the GC that won, when there's one recorded and no re-bid yet */
  onRebid?: () => void;
}) {
  const [data, setData] = useState<DealPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outcome = column?.outcome ?? "open";
  const companyWord = pipeline === "janitorial" ? "Company" : "GC";

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    fetch(`/api/erp/pipeline/deals/${card.id}/panel?pipeline=${pipeline}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (DealPanelData & { error?: string }) | null;
        if (!live) return;
        if (!res.ok || !body || body.error) setError(body?.error ?? "Couldn't load this deal.");
        else setData(body);
      })
      .catch(() => live && setError("Couldn't reach the server."));
    return () => {
      live = false;
    };
  }, [card.id, pipeline]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Do next: the shared attention list (dealAttention.ts), top 3, each with the button that handles it.
  const handlers: Record<AttentionAction, (() => void) | undefined> = {
    nextStep: onNextStep,
    editInfo: onEditInfo,
    moveTo: onMoveTo,
    markLost: onLost,
    lostReason: onLost,
    rebid: onRebid,
  };
  const shownTodos = attention.slice(0, 3);

  const range = card.perSqft != null ? priceRanges.find((r) => r.scope === card.scope) : undefined;
  const gc = data?.gc ?? null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={card.name} className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        {/* Header: what the deal is */}
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {card.url ? (
                <a href={card.url} target="_blank" rel="noreferrer" className="text-sm font-semibold leading-snug text-gray-900 hover:text-pink-600">
                  {card.name}
                </a>
              ) : (
                <p className="text-sm font-semibold leading-snug text-gray-900">{card.name}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {card.gc ? (
                  card.gc.companyId ? (
                    <Link href={`/erp/companies/${card.gc.companyId}`} className="hover:text-pink-600">
                      {card.gc.label}
                    </Link>
                  ) : (
                    card.gc.label
                  )
                ) : (
                  `No ${companyWord}`
                )}
                {card.owner && ` · ${card.owner}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded px-1.5 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              ×
            </button>
          </div>

          {/* Deal at a glance: amount, stage, chance to win */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{card.cents ? centsToDollarsCompact(card.cents) : "No amount"}</p>
              <p className="text-xs text-gray-500">
                {column?.label}
                {card.daysInStage != null && outcome === "open" ? ` · ${card.daysInStage} days` : ""}
              </p>
            </div>
            {card.chance && (
              <div className="w-36 text-right" title={`About ${pct(card.chance.p)}. Our average: ${winBase != null ? pct(winBase) : "-"}`}>
                <p className={`text-sm font-semibold ${BAND_TEXT[card.chance.band]}`}>
                  {card.chance.band} <span className="font-normal text-gray-500">· {pct(card.chance.p)}</span>
                </p>
                {/* Meter: share of 100%, with a tick at our average win rate. */}
                <div className="relative mt-1 h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full" style={{ width: `${Math.max(3, card.chance.p * 100)}%`, background: BAND_COLOR[card.chance.band] }} />
                  {winBase != null && <span aria-hidden className="absolute -top-0.5 h-3 w-0.5 bg-gray-700" style={{ left: `${winBase * 100}%` }} />}
                </div>
                {winBase != null && <p className="mt-0.5 text-[10px] text-gray-400">line = our average {pct(winBase)}</p>}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
          {/* Do next */}
          {outcome !== "won" && (
            <section>
              <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-900">
                Do next
                <InfoTip text="The few things that would help most with this deal right now, most urgent first." />
              </h3>
              {shownTodos.length === 0 ? (
                <p className={`rounded-md border px-3 py-2 text-xs ${TONE_BOX.green}`}>
                  {outcome === "open" ? `On track${card.nextStep ? `: ${card.nextStep.text}, ${shortDay(card.nextStep.dueDate)}` : ""}` : "Nothing left to do."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {shownTodos.map((t) => {
                    const run = t.action ? handlers[t.action] : undefined;
                    return (
                      <li key={t.key} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${TONE_BOX[t.tone]}`}>
                        <span>{t.text}</span>
                        {run && (
                          <Button size="xs" variant="secondary" onClick={run} className="shrink-0">
                            {t.actionLabel}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {outcome === "open" && card.nextStep && !attention.some((a) => a.key === "lateStep") && shownTodos.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-500">
                  Next step: {card.nextStep.text}, {shortDay(card.nextStep.dueDate)}
                </p>
              )}
            </section>
          )}
          {outcome === "lost" && card.lostReasons.length > 0 && (
            <p className="text-xs text-gray-600">
              Lost: {card.lostReasons.map(labelOf).join(", ")}
              {card.winner && ` · ${card.winner.name} won${card.winner.priceCents != null ? ` at ${centsToDollars(card.winner.priceCents)}` : ""}`}
            </p>
          )}

          {/* Why this chance: each factor's win rate on one scale, with our average as the reference line */}
          {card.chance && card.chance.factors.length > 0 && (
            <Section
              title="Why this chance"
              info={`How bids like this one turned out for us: the win rate of each group this deal is in. The line is our average${
                winBase != null ? ` (${pct(winBase)})` : ""
              }; bars past it help, bars short of it hurt.${
                winBacktest
                  ? ` Checked on our newest ${winBacktest.tested} decided bids: ${winBacktest.bands.map((b) => `${b.band} won ${b.won} of ${b.bids}`).join(", ")}.`
                  : ""
              }`}
            >
              {(() => {
                const scale = Math.max(0.4, ...card.chance.factors.map((f) => f.won / f.bids));
                return (
                  <ul className="space-y-1.5">
                    {card.chance.factors.map((f) => {
                      const rate = f.won / f.bids;
                      return (
                        <li key={f.label} className="text-xs" title={`Won ${f.won} of ${f.bids} bids`}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-gray-700">{f.label}</span>
                            <span className="shrink-0 tabular-nums text-gray-900">
                              {pct(rate)} <span className="text-gray-400">of {f.bids}</span>
                            </span>
                          </div>
                          <div className="relative mt-0.5 h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (rate / scale) * 100)}%`, background: FACTOR }} />
                            {winBase != null && (
                              <span aria-hidden className="absolute -top-0.5 h-2.5 w-0.5 bg-gray-700" style={{ left: `${(winBase / scale) * 100}%` }} />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </Section>
          )}

          {/* Price per sq ft against the usual range for this type of work */}
          {range && card.perSqft != null && (
            <Section
              title="Price per sq ft"
              info={`This deal's amount divided by Area SQFT, against the middle half of ${range.basis === "won" ? "jobs we won" : "our bids"} for this type of work (${range.samples} jobs). The shaded part is the usual range; the dark mark is this deal.`}
            >
              {(() => {
                const lo = Math.min(range.low, card.perSqft) * 0.8;
                const hi = Math.max(range.high, card.perSqft) * 1.2;
                const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
                const outside = card.perSqft < range.low || card.perSqft > range.high;
                return (
                  <>
                    <p className="text-xs text-gray-700">
                      <span className="text-base font-semibold tabular-nums text-gray-900">${card.perSqft.toFixed(2)}</span> · usual ${range.low.toFixed(2)} to
                      ${range.high.toFixed(2)}
                      {outside && <span className="ml-1 text-amber-700">({card.perSqft > range.high ? "high" : "low"})</span>}
                    </p>
                    <div className="relative mt-2 h-2 rounded-full bg-gray-100">
                      <div
                        className="absolute h-2 rounded-full bg-gray-300"
                        style={{ left: at(range.low), width: `calc(${at(range.high)} - ${at(range.low)})` }}
                      />
                      <span aria-hidden className="absolute -top-1 h-4 w-1 rounded bg-gray-900" style={{ left: `calc(${at(card.perSqft)} - 2px)` }} />
                    </div>
                  </>
                );
              })()}
            </Section>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {!data && !error && <p className="text-xs text-gray-400">Loading from HubSpot…</p>}

          {/* GC record: won, lost, open on one bar */}
          {gc && gc.bids > 0 && (
            <Section
              title={`${companyWord} record`}
              info={`Every deal in this pipeline with the same ${companyWord}. Win rate is won divided by won plus lost${winBase != null ? `; our average is ${pct(winBase)}` : ""}.`}
              right={
                gc.companyId ? (
                  <Link href={`/erp/companies/${gc.companyId}`} className="text-xs text-pink-600 hover:underline">
                    Scorecard
                  </Link>
                ) : undefined
              }
            >
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-gray-900">{gc.winRate != null ? pct(gc.winRate) : "-"}</span> win rate · {gc.won} won of {gc.won + gc.lost}{" "}
                decided
                {gc.gcNotAwarded ? ` · ${gc.gcNotAwarded} lost because they weren't awarded` : ""}
              </p>
              <div className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden rounded">
                {[
                  { n: gc.won, color: WON, label: "Won" },
                  { n: gc.lost, color: LOST, label: "Lost" },
                  { n: gc.open, color: "#e5e7eb", label: "Open" },
                ]
                  .filter((x) => x.n > 0)
                  .map((x) => (
                    <div key={x.label} title={`${x.label}: ${x.n}`} className="h-full" style={{ width: `${(x.n / gc.bids) * 100}%`, background: x.color }} />
                  ))}
              </div>
              <p className="mt-1 flex gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: WON }} />
                  Won {gc.won}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: LOST }} />
                  Lost {gc.lost}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-gray-200" />
                  Open {gc.open}
                </span>
              </p>
              {gc.price &&
                (() => {
                  const p = gc.price;
                  // Two or three magnitudes on one scale: what we quote them, what we win at with them, what we usually win at.
                  const bars = [
                    { label: "We quote them", v: p.quoted, sub: `${p.quotedN} bids`, color: "#374151" },
                    ...(p.won != null ? [{ label: "We win with them at", v: p.won, sub: `${p.wonN} wins`, color: FACTOR }] : []),
                    ...(p.usualWon != null ? [{ label: "We usually win at", v: p.usualWon, sub: "all GCs", color: "#d1d5db" }] : []),
                  ];
                  const max = Math.max(...bars.map((b) => b.v));
                  const gap = p.usualWon != null ? p.quoted / p.usualWon - 1 : null;
                  return (
                    <div className="mt-3" title={`${p.label}, $ per sq ft from quoted HubSpot amounts`}>
                      <p className="text-xs text-gray-700">
                        {p.label} price per sq ft
                        {gap != null && Math.abs(gap) >= 0.05 && (
                          <span className={gap > 0 ? "text-amber-700" : "text-gray-500"}>
                            {" "}
                            · we quote them {pct(Math.abs(gap))} {gap > 0 ? "above" : "below"} our usual win
                          </span>
                        )}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {bars.map((b) => (
                          <li key={b.label} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-2 text-[11px]">
                            <span className="truncate text-gray-500">{b.label}</span>
                            <span className="h-2 rounded-r" style={{ width: `${Math.max(4, (b.v / max) * 100)}%`, background: b.color }} />
                            <span className="tabular-nums text-gray-900">
                              ${b.v.toFixed(2)} <span className="text-gray-400">{b.sub}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
            </Section>
          )}

          {/* Key facts, as short chips */}
          {(card.bidDate || card.walkDate || card.awardDate || card.sqft != null || card.daysQuiet != null) && (
            <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-3 text-[11px]">
              {card.bidDate && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Bid {shortDay(card.bidDate)}</span>}
              {card.walkDate && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Walk {shortDay(card.walkDate)}</span>}
              {card.awardDate && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Award {shortDay(card.awardDate)}</span>}
              {card.sqft != null && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{card.sqft.toLocaleString()} sq ft</span>}
              {card.daysQuiet != null && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{card.daysQuiet} days since last activity</span>}
            </div>
          )}

          {data && (
            <>
              <Section
                title={`Activity${data.activity.length ? ` (${data.activity.length}${data.activityMore ? "+" : ""})` : ""}`}
                info="Calls, notes, tasks and meetings on this deal in HubSpot, newest first. Emails show here once the ERP is allowed to read them; until then the count links to HubSpot."
              >
                {data.activity.length === 0 && !data.hiddenEmails ? (
                  <p className="text-xs text-gray-400">Nothing logged in HubSpot.</p>
                ) : (
                  <ul className="space-y-2">
                    <Folded
                      items={data.activity}
                      first={3}
                      more="Show all"
                      render={(a) => (
                        <li key={`${a.kind}-${a.id}`} className="flex gap-2 text-xs">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[a.kind]}`} />
                          <div className="min-w-0">
                            <p className="text-gray-900">{a.title}</p>
                            <p className="text-gray-500">
                              {KIND_LABEL[a.kind]} · {when(a.at)}
                              {a.detail ? ` · ${a.detail}` : ""}
                            </p>
                          </div>
                        </li>
                      )}
                    />
                  </ul>
                )}
                {data.hiddenEmails > 0 && card.url && (
                  <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-pink-600 hover:underline">
                    {data.hiddenEmails} emails in HubSpot
                  </a>
                )}
              </Section>

              {data.lineItems.length > 0 && (
                <Section title={`Quote (${data.lineItems.length} lines)`} info="The deal's line items in HubSpot, usually copied from its quote.">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100">
                      <Folded
                        items={data.lineItems}
                        first={3}
                        more="Show all"
                        render={(li) => (
                          <tr key={li.id}>
                            <td className="py-1 pr-2 text-gray-900">{li.name}</td>
                            <td className="py-1 pl-2 text-right tabular-nums text-gray-900">{li.amountCents != null ? centsToDollars(li.amountCents) : ""}</td>
                          </tr>
                        )}
                      />
                    </tbody>
                  </table>
                </Section>
              )}

              {data.history.length > 0 && (
                <Section
                  title="Changes from the ERP"
                  info="Stage moves, lost reasons, info edits and next steps made from the ERP, newest first, with who made them."
                >
                  <ul className="space-y-1.5">
                    <Folded
                      items={data.history}
                      first={2}
                      more="Show all"
                      render={(h, i) => (
                        <li key={i} className="text-xs">
                          <p className="text-gray-900">{h.text}</p>
                          <p className="text-gray-400">
                            {when(h.at)}
                            {h.by ? ` · ${h.by}` : ""}
                          </p>
                        </li>
                      )}
                    />
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>

        {/* All actions in one place at the bottom */}
        <footer className="flex flex-wrap gap-2 border-t border-gray-200 px-4 py-3">
          {outcome === "open" && (
            <>
              <Button size="xs" variant="secondary" onClick={onNextStep}>
                Next step
              </Button>
              <Button size="xs" variant="secondary" onClick={onEditInfo}>
                Edit info
              </Button>
              <Button size="xs" variant="secondary" onClick={onMoveTo}>
                Move to
              </Button>
              <Button size="xs" variant="secondary" onClick={onLost}>
                Mark lost
              </Button>
            </>
          )}
          {outcome === "won" && (
            <Button size="xs" variant="secondary" onClick={onMoveTo}>
              Move to
            </Button>
          )}
          {outcome === "lost" && (
            <>
              <Button size="xs" variant="secondary" onClick={onLost}>
                {card.lostReasons.length ? "Change reason" : "Add reason"}
              </Button>
              {onRebid && card.winner && (
                <Button size="xs" variant="secondary" onClick={onRebid}>
                  Re-bid with {card.winner.name}
                </Button>
              )}
            </>
          )}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
