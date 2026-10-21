"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard as Card, BoardColumn } from "@/lib/erp/pipelineBoard";
import { cardFlag, TONE_CLASS, type Attention } from "@/lib/erp/dealAttention";
import { addDays, BAND_COLOR, initials, money2, shortDay } from "@/lib/erp/pipelineUi";
import { useBoard, type BoardContext } from "./context";

/** Deal names often end with the GC ("... - Russo Development"); the card shows the GC on its own line. */
function shortName(c: Card): string {
  const tail = c.gc ? ` - ${c.gc.label}` : "";
  return tail && c.name.toLowerCase().endsWith(tail.toLowerCase()) ? c.name.slice(0, -tail.length) : c.name;
}

/** Everything the card leaves out, for the hover text. */
function details(c: Card, b: BoardContext, items: Attention[]): string {
  return [
    c.name,
    c.cents ? centsToDollars(c.cents) : "No amount",
    c.owner ? `Owner: ${c.owner}` : "No owner",
    c.scopeLabel,
    c.bidDate && `Bid ${shortDay(c.bidDate)}`,
    c.walkDate && `Job walk ${shortDay(c.walkDate)}`,
    c.awardDate && `Award expected ${shortDay(c.awardDate)}`,
    c.daysInStage != null &&
      `${c.daysInStage} days in this stage${c.importedStage ? " (counted from the HubSpot import on Dec 26, 2024, so likely longer)" : ""}`,
    c.daysQuiet != null && `${c.daysQuiet} days since last activity`,
    c.chance && `Chance to win: ${c.chance.band} (about ${Math.round(c.chance.p * 100)}%). ${c.chance.reasons.join("; ")}`,
    c.gcRecord && `${b.companyWord} record: ${c.gcRecord.won} won of ${c.gcRecord.bids} bids`,
    c.nextStep && `Next step: ${c.nextStep.text}, due ${shortDay(c.nextStep.dueDate)}`,
    c.lostReasons.length > 0 && `Lost: ${c.lostReasons.map(b.labelOf).join(", ")}`,
    c.winner && `Won by ${c.winner.name}${c.winner.priceCents != null ? ` at ${centsToDollars(c.winner.priceCents)}` : ""}`,
    c.perSqft != null && `${money2(c.perSqft)} per sq ft`,
    ...items.map((a) => `• ${a.text}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/** The "..." menu on a card. */
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

/**
 * One deal: name, GC, amount, owner initials, and only the most urgent flag
 * (dealAttention.ts), plus the next step when it's due this week or late.
 * The left stripe is the chance to win. Clicking the card opens the panel.
 */
export function BoardCard({ c, outcome }: { c: Card; outcome: BoardColumn["outcome"] }) {
  const b = useBoard();
  const items = b.attentionOf(c);
  const flag = cardFlag(items);
  const step = outcome === "open" && c.nextStep && c.nextStep.dueDate <= addDays(b.today, 6) ? c.nextStep : null;
  const stripe = c.chance && c.chance.band !== "Long shot" ? BAND_COLOR[c.chance.band] : undefined;
  // Flags that open the editor that fixes them.
  const onFlag =
    flag?.action === "editInfo"
      ? () => b.editInfo(c)
      : flag?.action === "lostReason"
        ? () => b.editLost(c, false)
        : flag?.action === "rebid"
          ? () => b.rebid(c)
          : undefined;

  return (
    <div
      title={details(c, b, items)}
      role="button"
      tabIndex={0}
      // The card opens the side panel; its own links and buttons (name, GC, flag, menu) keep doing their thing.
      onClick={(e) => !(e.target as HTMLElement).closest("a,button") && b.openPanel(c)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && b.openPanel(c)}
      // Open deals move anywhere; won deals only forward; lost deals stay put (moving a won deal to lost would delete its ERP project).
      draggable={outcome !== "lost"}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
        b.dragStart(c);
      }}
      onDragEnd={() => b.dragEnd()}
      className="relative cursor-pointer overflow-hidden rounded-md border border-gray-200 bg-white py-2 pl-3 pr-2.5 shadow-sm hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
    >
      {stripe && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: stripe }} />}
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
              { label: "Next step", onClick: () => b.editNext(c) },
              { label: "Edit info", onClick: () => b.editInfo(c) },
              { label: "Move to", onClick: () => b.moveTo(c) },
              { label: "Mark lost", onClick: () => b.editLost(c, true) },
            ]}
          />
        )}
        {outcome === "won" && <CardMenu items={[{ label: "Move to", onClick: () => b.moveTo(c) }]} />}
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
          onClick={() => b.editNext(c)}
          className={`mt-1 block max-w-full truncate text-left text-[11px] hover:underline ${step.dueDate < b.today ? "font-medium text-red-600" : "text-amber-700"}`}
        >
          → {step.text} · {step.dueDate < b.today ? "late" : shortDay(step.dueDate)}
        </button>
      )}
      {outcome === "lost" && !flag && (c.lostReasons.length > 0 || c.rebid) && (
        <p className="mt-1 truncate text-[11px] text-gray-400">
          {c.rebid?.url ? (
            <a href={c.rebid.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
              Re-bid made
            </a>
          ) : (
            <button type="button" onClick={() => b.editLost(c, false)} className="hover:text-gray-600">
              {c.lostReasons.map(b.labelOf).join(", ")}
            </button>
          )}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-gray-900">{c.cents ? centsToDollarsCompact(c.cents) : "-"}</span>
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium">
          {flag &&
            (onFlag ? (
              <button type="button" onClick={onFlag} className={`truncate rounded px-1.5 py-0.5 hover:opacity-80 ${TONE_CLASS[flag.tone]}`}>
                {flag.chip}
              </button>
            ) : (
              <span className={`truncate rounded px-1.5 py-0.5 ${TONE_CLASS[flag.tone]}`}>{flag.chip}</span>
            ))}
          {c.owner && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[9px] font-semibold text-gray-600" title={c.owner}>
              {initials(c.owner)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
