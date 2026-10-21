"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useToast } from "@/app/erp/components/ui";
import { centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard, BoardColumn, PipelineBoard } from "@/lib/erp/pipelineBoard";
import { MISSING_FIELDS, MISSING_LABELS, type MissingField } from "@/lib/erp/pipelineMissing";
import { dealAttention } from "@/lib/erp/dealAttention";
import { BAND_COLOR, todayKey } from "@/lib/erp/pipelineUi";
import { DealInfoModal } from "./DealInfoModal";
import { DealPanel } from "./DealPanel";
import { RebidModal } from "./RebidModal";
import { NewDealModal } from "./NewDealModal";
import { MoveToModal } from "./MoveToModal";
import { LostReasonModal, type Option } from "./LostReasonModal";
import { NextStepModal } from "./NextStepModal";
import { BoardCtx, type BoardContext } from "./board/context";
import { BoardColumn as Column } from "./board/BoardColumn";
import { WeeklyStrip } from "./board/WeeklyStrip";
import { QuickViews } from "./board/QuickViews";
import { FilterMenu } from "./board/FilterMenu";
import { useBoardEdits } from "./board/useBoardEdits";
import { ME, NO_OWNER, applyFilters, sameFilters, viewPreset, type Filters, type ViewKey } from "./board/filters";

/**
 * The pipeline board: This week row, quick views, search and filter menu,
 * the stage columns, and the deal panel and editors. The pieces live in
 * ./board; this wires them together. Older won and lost deals are loaded by
 * the server (?closed=all); every other filter narrows the cards loaded.
 */
export function PipelineBoardView({
  board,
  closedDays,
  scopes,
  startOnMine,
  reasonOptions,
  companies,
  mayEditCompanies,
  typeOptions,
}: {
  board: PipelineBoard;
  closedDays: number;
  scopes: Option[];
  /** Open on the viewer's own deals (Sales and Estimation), when they own any here */
  startOnMine: boolean;
  /** HubSpot Deal Lost Reason options */
  reasonOptions: Option[];
  /** Companies, for who won a GC Not Awarded job */
  companies: Option[];
  /** Admin and Business Manager: can add a typed company name to a company's other names */
  mayEditCompanies: boolean;
  /** HubSpot Type of business options, for New deal */
  typeOptions: Option[];
}) {
  const router = useRouter();
  const toast = useToast();
  const isJan = board.pipeline === "janitorial";
  // Janitorial deals are for property managers and owners, not GCs.
  const companyWord = isJan ? "Company" : "GC";
  const today = todayKey();
  const columnOf = useMemo(() => new Map(board.columns.map((c) => [c.stageId, c])), [board.columns]);
  const lostLabel = board.columns.find((c) => c.outcome === "lost")?.label ?? "lost";

  // Editors and the side panel.
  const [editingLost, setEditingLost] = useState<{ card: BoardCard; markLost: boolean } | null>(null);
  const [editingNext, setEditingNext] = useState<BoardCard | null>(null);
  const [editingInfo, setEditingInfo] = useState<BoardCard | null>(null);
  const [editingRebid, setEditingRebid] = useState<BoardCard | null>(null);
  const [movingTo, setMovingTo] = useState<BoardCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BoardCard | null>(null);

  const edits = useBoardEdits(board, (card) => setEditingLost({ card, markLost: true }));
  const cards = edits.cards;

  // What needs attention on each card: one list for the card flag, the panel and the views.
  const attentionOf = useCallback(
    (c: BoardCard) => {
      const col = columnOf.get(c.stageId);
      return dealAttention(c, {
        outcome: col?.outcome ?? "open",
        stageLabel: col?.label ?? "this stage",
        expectsNextStep: !!col?.expectsNextStep,
        today,
        companyWord,
      });
    },
    [columnOf, today, companyWord],
  );
  const attentionKeys = useMemo(() => new Map(cards.map((c) => [c.id, attentionOf(c).map((a) => a.key)])), [cards, attentionOf]);

  // Filters and quick views.
  const hasMine = !!board.viewerOwnerId && cards.some((c) => c.ownerId === board.viewerOwnerId);
  const startView: ViewKey = startOnMine && hasMine ? "mine" : "everything";
  const startFilters = viewPreset(startView, hasMine).filters;
  const [filters, setFilters] = useState<Filters>(startFilters);
  const [search, setSearch] = useState("");
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const recentOnly = board.closed === "recent";

  function setClosed(next: "recent" | "all") {
    if (next === board.closed) return;
    const q = new URLSearchParams();
    if (isJan) q.set("pipeline", "janitorial");
    if (next === "all") q.set("closed", "all");
    router.push(q.size ? `/erp/pipeline?${q}` : "/erp/pipeline");
  }

  const views = useMemo(() => {
    const list: { key: ViewKey; label: string }[] = [{ key: "everything", label: "Everything" }];
    if (hasMine) list.push({ key: "mine", label: "My deals" });
    list.push({ key: "todos", label: hasMine ? "My to-dos" : "To-dos" }, { key: "cleanup", label: "Clean up" }, { key: "lost", label: "Lost follow-up" });
    if (!isJan) list.push({ key: "bids", label: "Bids this week" });
    return list;
  }, [hasMine, isJan]);
  // A view is lit only when both its filters and its older-deals setting match.
  const activeView =
    views.find((v) => {
      const p = viewPreset(v.key, hasMine);
      return sameFilters(p.filters, filters) && (p.closed ?? "recent") === board.closed;
    })?.key ?? null;
  function pickView(v: ViewKey) {
    const p = viewPreset(v, hasMine);
    setFilters(p.filters);
    setClosed(p.closed ?? "recent");
  }
  const filtersActive = !sameFilters(filters, startFilters) || !recentOnly;

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

  const shown = useMemo(
    () => applyFilters(cards, filters, { today, search, viewerOwnerId: board.viewerOwnerId, columnOf, attentionOf: attentionKeys }),
    [cards, filters, today, search, board.viewerOwnerId, columnOf, attentionKeys],
  );
  const byStage = useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const c of shown) m.set(c.stageId, [...(m.get(c.stageId) ?? []), c]);
    return m;
  }, [shown]);
  // Counts per missing field over the cards the other filters leave.
  const missingCounts = useMemo(() => {
    const m = new Map<MissingField, number>();
    for (const c of shown) for (const f of c.missing) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [shown]);

  // The card actions call the latest move code through these (the context value is memoized).
  const moveRef = useRef(edits.moveCard);
  moveRef.current = edits.moveCard;
  const canMoveRef = useRef(edits.canMove);
  canMoveRef.current = edits.canMove;
  const labels = useMemo(() => new Map(reasonOptions.map((o) => [o.value, o.label])), [reasonOptions]);
  const ctx = useMemo<BoardContext>(
    () => ({
      today,
      companyWord,
      labelOf: (r) => labels.get(r) ?? r,
      missingLabel: (f) => (f === "company" ? companyWord : MISSING_LABELS[f]),
      attentionOf,
      openPanel: (card) => setPanelId(card.id),
      editLost: (card, markLost) => setEditingLost({ card, markLost }),
      editNext: setEditingNext,
      editInfo: setEditingInfo,
      rebid: setEditingRebid,
      moveTo: setMovingTo,
      dragging,
      dragStart: setDragging,
      dragEnd: () => setDragging(null),
      canMove: (card, col) => canMoveRef.current(card, col),
      drop: (col: BoardColumn) => {
        if (dragging) void moveRef.current(dragging, col);
        setDragging(null);
      },
    }),
    [today, companyWord, labels, attentionOf, dragging],
  );

  const panelCard = panelId ? (cards.find((c) => c.id === panelId) ?? null) : null;
  const closePanel = useCallback(() => setPanelId(null), []);
  const owners = board.activeOwners.map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className="space-y-3">
      <WeeklyStrip board={board} />
      <QuickViews views={views} active={activeView} onPick={pickView} />

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
                  <span className="h-3 w-1 rounded-sm" style={{ background: BAND_COLOR[band] }} />
                  {band} chance
                </span>
              ))}
            <InfoTip
              align="right"
              text={`Each card: deal name (opens HubSpot), ${companyWord}, amount and the owner's initials, plus the one thing that needs attention most. A next step shows when it's due this week or late.${
                isJan ? "" : " The stripe on the left is the chance to win: green Strong, gray Fair, none for Long shot."
              } Hover a card for everything else, or click it for the deal panel.`}
            />
          </div>
          <FilterMenu
            filters={filters}
            update={update}
            active={filtersActive}
            onReset={() => {
              setFilters(startFilters);
              setClosed("recent");
            }}
            ownerOptions={ownerOptions}
            gcOptions={gcOptions}
            scopes={scopes}
            isJan={isJan}
            companyWord={companyWord}
            closed={board.closed}
            onClosed={setClosed}
            closedDays={closedDays}
          />
          <Button size="sm" onClick={() => setCreating(true)}>
            New deal
          </Button>
        </div>
      </div>

      {filters.flags.includes("missing") && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-gray-500">
            Missing
            <InfoTip text="Open deals missing what their stage needs: an active owner and a GC always; a Bid Date from Bidding on; an amount (and on post-construction, Area SQFT) in the quote stages. Click one to see only those." />
          </span>
          {MISSING_FIELDS.map((f) => {
            const n = missingCounts.get(f) ?? 0;
            if (!n) return null;
            const on = filters.missingField === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => update({ missingField: on ? "" : f })}
                className={`rounded-full border px-2 py-0.5 ${on ? "border-sky-300 bg-sky-50 text-sky-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
              >
                {ctx.missingLabel(f)} {n}
              </button>
            );
          })}
        </div>
      )}

      <BoardCtx.Provider value={ctx}>
        <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
          {board.columns.map((col) => (
            <Column key={col.stageId} col={col} cards={byStage.get(col.stageId) ?? []} closedDays={closedDays} recentOnly={recentOnly} />
          ))}
        </div>
      </BoardCtx.Provider>

      {edits.undo && (
        <div className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          <span className="max-w-[60vw] truncate">
            Moved {edits.undo.name} to {edits.undo.toLabel}
          </span>
          <button type="button" onClick={() => void edits.undoMove()} className="font-semibold text-pink-300 hover:text-pink-200">
            Undo
          </button>
        </div>
      )}

      {panelCard && (
        <DealPanel
          card={panelCard}
          column={columnOf.get(panelCard.stageId)}
          pipeline={board.pipeline}
          attention={attentionOf(panelCard)}
          labelOf={ctx.labelOf}
          winBacktest={board.winBacktest}
          winBase={board.winBase}
          priceRanges={board.priceRanges}
          onClose={closePanel}
          onNextStep={() => setEditingNext(panelCard)}
          onEditInfo={() => setEditingInfo(panelCard)}
          onMoveTo={() => setMovingTo(panelCard)}
          onLost={() => setEditingLost({ card: panelCard, markLost: columnOf.get(panelCard.stageId)?.outcome !== "lost" })}
          onRebid={panelCard.gcNotAwarded && panelCard.winner && !panelCard.rebid ? () => setEditingRebid(panelCard) : undefined}
        />
      )}
      {movingTo && (
        <MoveToModal
          card={movingTo}
          columns={board.columns.filter((c) => edits.canMove(movingTo, c))}
          onClose={() => setMovingTo(null)}
          onPick={(col) => {
            const card = movingTo;
            setMovingTo(null);
            void edits.moveCard(card, col);
          }}
        />
      )}
      {creating && (
        <NewDealModal
          pipeline={board.pipeline}
          columns={board.columns.filter((c) => c.outcome === "open")}
          cards={cards}
          owners={owners}
          companies={companies}
          typeOptions={typeOptions}
          defaultOwnerId={board.viewerOwnerId ?? ""}
          onClose={() => setCreating(false)}
          onSaved={(deal) => {
            setCreating(false);
            toast(`Created in HubSpot: ${deal.name}`, "success");
            // The server adds it to the board from the ERP's copy; the panel opens once it's there.
            setPanelId(deal.newDealId);
            router.refresh();
          }}
        />
      )}
      {editingRebid && (
        <RebidModal
          card={editingRebid}
          owners={owners}
          defaultOwnerId={board.activeOwners.some((o) => o.id === editingRebid.ownerId) ? (editingRebid.ownerId ?? "") : (board.viewerOwnerId ?? "")}
          onClose={() => setEditingRebid(null)}
          onSaved={(r) => {
            edits.saveRebid(editingRebid.id, r);
            setEditingRebid(null);
            toast("Re-bid deal created in HubSpot. It shows in Lead after the next refresh.", "success");
          }}
        />
      )}
      {editingInfo && (
        <DealInfoModal
          card={editingInfo}
          pipeline={board.pipeline}
          owners={owners}
          companies={companies}
          mayEditCompanies={mayEditCompanies}
          onClose={() => setEditingInfo(null)}
          onSaved={(info) => {
            edits.saveInfo(editingInfo.id, info);
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
            edits.saveNext(editingNext.id, next);
            setEditingNext(null);
            toast(next ? "Next step saved." : "Next step done.", "success");
          }}
        />
      )}
      {editingLost && (
        <LostReasonModal
          card={editingLost.card}
          pipeline={board.pipeline}
          markLost={editingLost.markLost}
          lostStageLabel={lostLabel}
          reasonOptions={reasonOptions}
          companies={companies}
          onClose={() => setEditingLost(null)}
          onSaved={(result) => {
            const { card, markLost } = editingLost;
            edits.saveLost(card.id, result);
            setEditingLost(null);
            toast(markLost ? `Marked lost in HubSpot: ${card.name}` : "Lost reason saved in HubSpot.", "success");
          }}
        />
      )}
    </div>
  );
}
